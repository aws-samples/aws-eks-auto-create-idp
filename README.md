# Amazon EKS IAM Identity Provider Automation

This project builds a mechanism that automatically manages the lifecycle of
OpenID Connect identity providers (IDPs) in [AWS
IAM](https://aws.amazon.com/iam/) that correspond to Amazon EKS clusters.
Creating such IDPs is a prerequisite for enabling [IAM Roles for Service
Accounts](https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html)
in an [Amazon EKS](https://aws.amazon.com/eks/) cluster.

This mechanism is useful for AWS customers that have strict policies around the
creation of [IAM Identity
Providers](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers.html).
Such customers might allow users or teams to create EKS clusters and even IAM
roles, but restrict the creation of IDPs to a subset of trusted individuals.
Having this mechanism be authorized by proxy allows teams to create EKS clusters
and take advantage of IAM Roles for Service Accounts, without giving them the
access to create arbitrary IAM Identity Providers.

## Prerequisites

1. [AWS Cloud Development Kit (CDK)](https://aws.amazon.com/cdk/) must be
   installed on the deployment host.
2. The account must have an [AWS CloudTrail](https://aws.amazon.com/cloudtrail/)
   trail enabled.

## Quick start

```sh
$ npm install eks-auto-create-idp
$ npm run cdk deploy
```

## Theory of operations

1. An [Amazon EventBridge](https://aws.amazon.com/eventbridge/) event pattern is
   created that matches Amazon EKS cluster creation and deletion events.
2. When a cluster is created, an [AWS Step
   Function](https://aws.amazon.com/step-functions/) is executed. This Step
   Function polls for the creation of the cluster. When the cluster has finally
   been created, a helper function creates a matching OpenID Connect Identity
   Provider in the same account.
3. When a cluster is deleted, an [AWS Lambda
   function](https://aws.amazon.com/lambda/) is called that deletes the matching
   OIDC IDP in AWS IAM.

## License

MIT
