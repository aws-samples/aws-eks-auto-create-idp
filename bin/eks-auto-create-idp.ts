#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { EksAutoCreateIdpStack } from '../lib/eks-auto-create-idp-stack';

const app = new cdk.App();
new EksAutoCreateIdpStack(app, 'EksAutoCreateIdpStack');
