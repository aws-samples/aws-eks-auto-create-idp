import * as cdk from '@aws-cdk/core';
import * as cloudtrail from '@aws-cdk/aws-cloudtrail';
import * as lambda from '@aws-cdk/aws-lambda';
import * as iam from '@aws-cdk/aws-iam';
import * as targets from '@aws-cdk/aws-events-targets';
import * as destinations from '@aws-cdk/aws-lambda-destinations';

export class EksAutoCreateIdpStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const code = lambda.AssetCode.fromAsset('resource/manage-iam-idp');

    const createIdpFunction = new lambda.Function(this, 'CreateIdpFunction', {
      code,
      handler: 'index.onCreateCluster',
      runtime: lambda.Runtime.NODEJS_12_X,
      timeout: cdk.Duration.minutes(15)
    });
    if (createIdpFunction.role) {
      createIdpFunction.role.addToPolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['eks:DescribeCluster'],
        resources: ['*']
      }));
      createIdpFunction.role.addToPolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['iam:CreateOpenIDConnectProvider'],
        resources: ['*']
      }));
    }

    const deleteIdpFunction = new lambda.Function(this, 'DeleteIdpFunction', {
      code,
      handler: 'index.onDeleteCluster',
      runtime: lambda.Runtime.NODEJS_12_X,
      timeout: cdk.Duration.minutes(15)
    });
    if (deleteIdpFunction.role) {
      deleteIdpFunction.role.addToPolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['eks:DescribeCluster'],
        resources: ['*']
      }));
      deleteIdpFunction.role.addToPolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'iam:DeleteOpenIDConnectProvider',
          'iam:ListOpenIDConnectProviders',
          'iam:GetOpenIDConnectProvider'
        ],
        resources: ['*']
      }));
    }

    cloudtrail.Trail.onEvent(this, 'EksClusterCreatedEvent', {
      description: 'Create OpenID Connect Provider when a new EKS Cluster is created',
      eventPattern: {
        detail: {
          eventSource: ['eks.amazonaws.com'],
          eventName: ['CreateCluster']
        }
      },
      target: new targets.LambdaFunction(createIdpFunction),
    });

    cloudtrail.Trail.onEvent(this, 'EksClusterDeletedEvent', {
      description: 'Delete OpenID Connect Provider when an EKS Cluster is deleted',
      eventPattern: {
        detail: {
          eventSource: ['eks.amazonaws.com'],
          eventName: ['DeleteCluster']
        }
      },
      target: new targets.LambdaFunction(deleteIdpFunction)
    });
  }
}
