import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB - Scores table
    const scoresTable = new dynamodb.Table(this, 'QuizScores', {
      tableName: 'QuizScores',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // DynamoDB - Users table (NEW)
    const usersTable = new dynamodb.Table(this, 'QuizUsers', {
      tableName: 'QuizUsers',
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Lambda
    const generateQuizLambda = new lambda.Function(this, 'GenerateQuizLambda', {
      functionName: 'GenerateQuizFunction',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'generateNotes.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      timeout: cdk.Duration.seconds(30),
      environment: {
        SCORES_TABLE: scoresTable.tableName,
        USERS_TABLE: usersTable.tableName,
        GROQ_API_KEY: process.env.GROQ_API_KEY || '',
      },
    });

    scoresTable.grantReadWriteData(generateQuizLambda);
    usersTable.grantReadWriteData(generateQuizLambda);

    generateQuizLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['*'],
    }));

    // API Gateway
    const api = new apigateway.RestApi(this, 'QuizGeneratorApi', {
      restApiName: 'QuizGeneratorAPI',
      description: 'API for Quiz Generator',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const lambdaIntegration = new apigateway.LambdaIntegration(generateQuizLambda, { proxy: true });

    // Routes
    const quizResource = api.root.addResource('quiz');
    quizResource.addMethod('POST', lambdaIntegration);

    const scoreResource = api.root.addResource('score');
    scoreResource.addMethod('POST', lambdaIntegration);
    scoreResource.addMethod('GET', lambdaIntegration);

    // Auth routes (NEW)
    const authResource = api.root.addResource('auth');
    const registerResource = authResource.addResource('register');
    registerResource.addMethod('POST', lambdaIntegration);
    const loginResource = authResource.addResource('login');
    loginResource.addMethod('POST', lambdaIntegration);

    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway URL',
      exportName: 'QuizGeneratorApiUrl',
    });
    new cdk.CfnOutput(this, 'TableName', { value: scoresTable.tableName });
    new cdk.CfnOutput(this, 'UsersTableName', { value: usersTable.tableName });
  }
}