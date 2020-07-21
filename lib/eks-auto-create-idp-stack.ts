import * as cdk from '@aws-cdk/core';
import * as cloudtrail from '@aws-cdk/aws-cloudtrail';
import * as lambda from '@aws-cdk/aws-lambda';
import * as iam from '@aws-cdk/aws-iam';
import * as targets from '@aws-cdk/aws-events-targets';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import * as tasks from '@aws-cdk/aws-stepfunctions-tasks';

export class EksAutoCreateIdpStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const code = lambda.AssetCode.fromAsset('resource/manage-iam-idp');

    const startStateMachine = new lambda.Function(this, 'StartStateMachine', {
      code,
      handler: 'index.startStateMachine',
      runtime: lambda.Runtime.NODEJS_12_X,
      timeout: cdk.Duration.minutes(1),
    });
    if (startStateMachine.role) {
      startStateMachine.role.addToPolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['eks:DescribeCluster'],
        resources: ['*']
      }));
    }

    const isClusterReady = new lambda.Function(this, 'IsClusterReady', {
      code,
      handler: 'index.isClusterReady',
      runtime: lambda.Runtime.NODEJS_12_X,
      timeout: cdk.Duration.minutes(1)
    });
    if (isClusterReady.role) {
      isClusterReady.role.addToPolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['eks:DescribeCluster'],
        resources: ['*']
      }));
    }

    const createOIDCProvider = new lambda.Function(this, 'CreateOIDCProvider', {
      code,
      handler: 'index.createOIDCProvider',
      runtime: lambda.Runtime.NODEJS_12_X,
      timeout: cdk.Duration.minutes(1)
    });
    if (createOIDCProvider.role) {
      createOIDCProvider.role.addToPolicy(new iam.PolicyStatement({
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
      target: new targets.LambdaFunction(startStateMachine),
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

    const isClusterReadyTask = new tasks.LambdaInvoke(this, 'IsClusterReadyState', {
      lambdaFunction: isClusterReady,
    }).addRetry({
      backoffRate: 1,
      interval: cdk.Duration.seconds(30),
      maxAttempts: 50
    });

    const createOIDCProviderTask = new tasks.LambdaInvoke(this, 'CreateOIDCProviderState', {
      lambdaFunction: createOIDCProvider,
      inputPath: '$.Payload'
    });

    const stateMachine = new sfn.StateMachine(this, 'StateMachine', {
      definition: isClusterReadyTask.next(createOIDCProviderTask)
    });
    stateMachine.grantStartExecution(startStateMachine);
    startStateMachine.addEnvironment('STATE_MACHINE_ARN', stateMachine.stateMachineArn);
  }
}
