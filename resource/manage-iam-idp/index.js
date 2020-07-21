// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

'use strict';

const AWS = require('aws-sdk');
const https = require('https');
const tls = require('tls');
const { URL } = require('url');

exports.startStateMachine = async function (event, context) {
  const sfn = new AWS.StepFunctions();
  const eks = new AWS.EKS();

  const data = await eks.describeCluster({
    name: event.detail.requestParameters.name
  }).promise();

  const { executionArn } = await sfn.startExecution({
    stateMachineArn: process.env.STATE_MACHINE_ARN,
    input: JSON.stringify(data)
  }).promise();

  console.log(`Step function started: ${executionArn}`);
};

exports.isClusterReady = async function (event, context) {
  const eks = new AWS.EKS();

  const { cluster } = await eks.describeCluster({
    name: event.cluster.name
  }).promise();

  console.log(`EKS cluster ${cluster.name} status is ${cluster.status}`);

  if (cluster.status === 'ACTIVE') {
    return { cluster };
  }
  throw new Error('Not ready');
};

exports.createOIDCProvider = async function (event, context) {
  const iam = new AWS.IAM();

  const issuer = event.cluster.identity.oidc.issuer;

  console.log(`Getting CA thumbprint for ${issuer}...`);
  const thumbprint = await getCAThumbprint(issuer);

  console.log(`Adding ${issuer} as OpenID Connect provider...`);
  await iam.createOpenIDConnectProvider({
    ClientIDList: ['sts.amazonaws.com'],
    ThumbprintList: [thumbprint.replace(/:/g, '')],
    Url: issuer
  }).promise();
};

exports.onCreateCluster = async function (event, context) {
  console.log(JSON.stringify(event));

  const clusterName = event.detail.requestParameters.name;
  const eks = new AWS.EKS();
  const iam = new AWS.IAM();

  console.log(`Waiting for cluster ${clusterName} to become active...`);
  const { cluster } = await eks.waitFor('clusterActive', {
    name: clusterName
  }).promise();

  const issuer = cluster.identity.oidc.issuer;

  console.log(`Getting CA thumbprint for ${issuer}...`);
  const thumbprint = await getCAThumbprint(issuer);

  console.log(`Adding ${issuer} as OpenID Connect provider...`);
  await iam.createOpenIDConnectProvider({
    ClientIDList: ['sts.amazonaws.com'],
    ThumbprintList: [thumbprint.replace(/:/g, '')],
    Url: issuer
  }).promise();
};

exports.onDeleteCluster = async function (event, context) {
  console.log(JSON.stringify(event));

  const clusterName = event.detail.requestParameters.name;
  const eks = new AWS.EKS();
  const iam = new AWS.IAM();

  const { cluster } = await eks.describeCluster({
    name: clusterName
  }).promise();
  const issuer = cluster.identity.oidc.issuer;
  console.log(`issuer is ${issuer}`);

  const providers = await iam.listOpenIDConnectProviders().promise();
  for (const entry of providers.OpenIDConnectProviderList) {
    const provider = await iam.getOpenIDConnectProvider({
      OpenIDConnectProviderArn: entry.Arn
    }).promise();
    console.log(JSON.stringify(provider));
    if (provider.Url === issuer.replace(/^https:\/\//, '')) {
      console.log(`Removing OpenID Connect provider ${entry.Arn}...`);
      await iam.deleteOpenIDConnectProvider({
        OpenIDConnectProviderArn: entry.Arn
      }).promise();
      return;
    }
  }
  console.log('OpenID Connect provider not found');
};

const getCAThumbprint = async function (url) {
  const jwksUri = await getJwksUri(url);
  const hostname = new URL(jwksUri).hostname;

  return new Promise((resolve, reject) => {
    const fingerprints = [];
    const socket = tls.connect(443, hostname, {
      checkServerIdentity: () => {} // certificate won't match hostname
    }).on('secureConnect', () => {
      let cert = socket.getPeerCertificate(true);
      // Follow certificate chain. Stop when we reach the root certificate.
      while (cert.issuerCertificate !== cert) {
        fingerprints.push(cert.fingerprint);
        cert = cert.issuerCertificate;
      }
      socket.destroy();
      // Return the last fingerprint.
      resolve(fingerprints[fingerprints.length - 1]);
    }).on('error', (err) => {
      reject(err);
    });
  });
};

const getJwksUri = async function (url) {
  return new Promise((resolve, reject) => {
    https.get(`${url}/.well-known/openid-configuration`, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Request returned ${res.statusCode}`));
      }
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(rawData);
          resolve(data.jwks_uri);
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
};
