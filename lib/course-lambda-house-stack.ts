import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as iam from "aws-cdk-lib/aws-iam";
import * as appsync from "aws-cdk-lib/aws-appsync";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as events from "aws-cdk-lib/aws-events";
import * as eventsTargets from "aws-cdk-lib/aws-events-targets";
import * as path from "path";
export class CourseLambdaHouseStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //MA

    // Create PostConfirmation Lambda function
    const postConfirmationLambda = new NodejsFunction(
      this,
      "PostConfirmationLambda",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "handler",
        entry: path.join(
          __dirname,
          "../functions/post-confirmation/handler.ts"
        ),
        bundling: {
          minify: true,
          sourceMap: true,
          sourcesContent: false,
          target: "node20",
        },
        environment: {
          NODE_OPTIONS: "--enable-source-maps",
        },
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
      }
    );

    const userPool = new cognito.UserPool(this, "LHUserPool", {
      userPoolName: "lh-user-pool",
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      customAttributes: {
        firstName: new cognito.StringAttribute({
          minLen: 1,
          maxLen: 50,
          mutable: true,
        }),
        lastName: new cognito.StringAttribute({
          minLen: 1,
          maxLen: 50,
          mutable: true,
        }),
        contactNumber: new cognito.StringAttribute({
          minLen: 10,
          maxLen: 20,
          mutable: true,
        }),
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      lambdaTriggers: {
        postConfirmation: postConfirmationLambda,
      },
    });

    const userPoolClient = new cognito.UserPoolClient(
      this,
      "LHUserPoolClient",
      {
        userPool,
        userPoolClientName: "lh-web-client",
        authFlows: {
          userPassword: true,
          userSrp: true,
        },
        generateSecret: false,
        readAttributes: new cognito.ClientAttributes()
          .withStandardAttributes({
            email: true,
            emailVerified: true,
          })
          .withCustomAttributes("firstName", "lastName", "contactNumber"),
        writeAttributes: new cognito.ClientAttributes()
          .withStandardAttributes({
            email: true,
          })
          .withCustomAttributes("firstName", "lastName", "contactNumber"),
      }
    );

    // Create Cognito Groups
    const userGroup = new cognito.CfnUserPoolGroup(this, "UserGroup", {
      userPoolId: userPool.userPoolId,
      groupName: "user",
      description: "Standard user group",
      precedence: 3,
    });

    const paidGroup = new cognito.CfnUserPoolGroup(this, "PaidGroup", {
      userPoolId: userPool.userPoolId,
      groupName: "paid",
      description: "Paid users with premium features",
      precedence: 2,
    });

    const adminGroup = new cognito.CfnUserPoolGroup(this, "AdminGroup", {
      userPoolId: userPool.userPoolId,
      groupName: "admin",
      description: "Administrator group with elevated privileges",
      precedence: 1,
    });

    // Create DynamoDB Tables
    const userTable = new dynamodb.Table(this, "UserTable", {
      tableName: "lh-users",
      partitionKey: {
        name: "userId",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
    });

    // Add GSI for cognitoUserId lookups
    userTable.addGlobalSecondaryIndex({
      indexName: "cognitoUserId",
      partitionKey: {
        name: "cognitoUserId",
        type: dynamodb.AttributeType.STRING,
      },
    });

    // Create S3 Bucket
    const userFilesBucket = new s3.Bucket(this, "UserFilesBucket", {
      bucketName: `lh-user-files-${this.account}-${this.region}`,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      cors: [
        {
          allowedHeaders: ["*"],
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
          ],
          allowedOrigins: ["*"],
          exposedHeaders: ["ETag"],
          maxAge: 3000,
        },
      ],
    });

    // Create Lambda functions for Step Functions
    const generateUserIdLambda = new NodejsFunction(
      this,
      "GenerateUserIdLambda",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "handler",
        entry: path.join(
          __dirname,
          "../functions/user-creation/generate-user-id/handler.ts"
        ),
        bundling: {
          minify: true,
          sourceMap: true,
          sourcesContent: false,
          target: "node20",
        },
        environment: {
          NODE_OPTIONS: "--enable-source-maps",
        },
        timeout: cdk.Duration.seconds(3),
        memorySize: 128,
      }
    );

    const createDynamoDBUserLambda = new NodejsFunction(
      this,
      "CreateDynamoDBUserLambda",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "handler",
        entry: path.join(
          __dirname,
          "../functions/user-creation/create-dynamodb-user/handler.ts"
        ),
        bundling: {
          minify: true,
          sourceMap: true,
          sourcesContent: false,
          target: "node20",
        },
        environment: {
          USER_TABLE_NAME: userTable.tableName,
          NODE_OPTIONS: "--enable-source-maps",
          SES_SOURCE_EMAIL: "vidit0210@gmail.com",
        },
        timeout: cdk.Duration.seconds(10),
        memorySize: 256,
      }
    );

    const createS3FolderLambda = new NodejsFunction(
      this,
      "CreateS3FolderLambda",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "handler",
        entry: path.join(
          __dirname,
          "../functions/user-creation/create-s3-folder/handler.ts"
        ),
        bundling: {
          minify: true,
          sourceMap: true,
          sourcesContent: false,
          target: "node20",
        },
        environment: {
          USER_FILES_BUCKET_NAME: userFilesBucket.bucketName,
          NODE_OPTIONS: "--enable-source-maps",
        },
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
      }
    );

    // Create Lambda function for sending welcome email
    const sendWelcomeEmailLambda = new NodejsFunction(
      this,
      "SendWelcomeEmailLambda",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "handler",
        entry: path.join(
          __dirname,
          "../functions/user-creation/send-welcome-email/handler.ts"
        ),
        bundling: {
          minify: true,
          sourceMap: true,
          sourcesContent: false,
          target: "node20",
        },
        timeout: cdk.Duration.seconds(10),
        memorySize: 256,
        environment: {
          NODE_OPTIONS: "--enable-source-maps",
          SES_SOURCE_EMAIL: "vidit0210@gmail.com",
        },
      }
    );

    // Grant permissions
    userTable.grantWriteData(createDynamoDBUserLambda);
    userFilesBucket.grantWrite(createS3FolderLambda);

    sendWelcomeEmailLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ses:SendEmail", "ses:SendRawEmail"],
        resources: [
          `arn:aws:ses:${this.region}:${this.account}:identity/vidit0210@gmail.com`,
        ],
      })
    );

    // Create Step Functions tasks
    const generateUserIdTask = new tasks.LambdaInvoke(
      this,
      "GenerateUserIdTask",
      {
        lambdaFunction: generateUserIdLambda,
        outputPath: "$.Payload",
      }
    );

    const createDynamoDBUserTask = new tasks.LambdaInvoke(
      this,
      "CreateDynamoDBUserTask",
      {
        lambdaFunction: createDynamoDBUserLambda,
        outputPath: "$.Payload",
      }
    );

    const createS3FolderTask = new tasks.LambdaInvoke(
      this,
      "CreateS3FolderTask",
      {
        lambdaFunction: createS3FolderLambda,
        outputPath: "$.Payload",
        retryOnServiceExceptions: true,
      }
    );

    const sendWelcomeEmailTask = new tasks.LambdaInvoke(
      this,
      "SendWelcomeEmailTask",
      {
        lambdaFunction: sendWelcomeEmailLambda,
        outputPath: "$.Payload",
        retryOnServiceExceptions: true,
      }
    );

    // Create parallel state for DynamoDB and S3 operations
    const parallelState = new sfn.Parallel(this, "CreateUserResources", {
      outputPath: "$[0]", // Take the first element of the parallel output array
    })
      .branch(createDynamoDBUserTask)
      .branch(createS3FolderTask);

    // Define the state machine
    const definition = generateUserIdTask
      .next(parallelState)
      .next(sendWelcomeEmailTask);

    const userCreationStateMachine = new sfn.StateMachine(
      this,
      "UserCreationStateMachine",
      {
        stateMachineName: "user-creation-workflow",
        definitionBody: sfn.DefinitionBody.fromChainable(definition),
        timeout: cdk.Duration.minutes(5),
      }
    );

    // Grant PostConfirmation Lambda permission to start executions
    userCreationStateMachine.grantStartExecution(postConfirmationLambda);

    // Grant PostConfirmation Lambda permission to add users to groups
    // Using a wildcard to avoid circular dependency
    postConfirmationLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cognito-idp:AdminAddUserToGroup"],
        resources: [
          `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/*`,
        ],
      })
    );

    // Add state machine ARN to PostConfirmation Lambda environment
    postConfirmationLambda.addEnvironment(
      "USER_CREATION_STATE_MACHINE_ARN",
      userCreationStateMachine.stateMachineArn
    );

    new cdk.CfnOutput(this, "UserPoolId", {
      value: userPool.userPoolId,
      description: "Cognito User Pool ID",
    });

    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
      description: "Cognito User Pool Client ID",
    });

    //=====================================================
    // APPSYNC API
    // =====================================================
    const api = new appsync.GraphqlApi(this, "PropertyApi", {
      name: "lh-property-api",
      schema: appsync.SchemaFile.fromAsset(
        path.join(__dirname, "../schema.graphql")
      ),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool,
          },
        },
      },
      xrayEnabled: true,
    });

    new cdk.CfnOutput(this, "GraphqlApiUrl", {
      value: api.graphqlUrl,
      description: "AppSync GraphQL endpoint URL",
    });

    new cdk.CfnOutput(this, "GraphqlApiId", {
      value: api.apiId,
      description: "AppSync GraphQL API ID",
    });
    // =====================================================
    // UPGRADE USER TO PAID TIER FUNCTIONALITY
    // =====================================================

    // Create Lambda functions for upgrade workflow
    const updateCognitoGroupLambda = new NodejsFunction(
      this,
      "UpdateCognitoGroupLambda",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "handler",
        entry: path.join(
          __dirname,
          "../functions/upgrade-user/update-cognito-group/handler.ts"
        ),
        bundling: {
          minify: true,
          sourceMap: true,
          sourcesContent: false,
          target: "node20",
        },
        environment: {
          USER_POOL_ID: userPool.userPoolId,
          NODE_OPTIONS: "--enable-source-maps",
        },
        timeout: cdk.Duration.seconds(5),
        memorySize: 128,
      }
    );

    const updateUserTierLambda = new NodejsFunction(
      this,
      "UpdateUserTierLambda",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "handler",
        entry: path.join(
          __dirname,
          "../functions/upgrade-user/update-user-tier/handler.ts"
        ),
        bundling: {
          minify: true,
          sourceMap: true,
          sourcesContent: false,
          target: "node20",
        },
        environment: {
          USER_TABLE_NAME: userTable.tableName,
          NODE_OPTIONS: "--enable-source-maps",
        },
        timeout: cdk.Duration.seconds(10),
        memorySize: 256,
      }
    );

    const sendProWelcomeEmailLambda = new NodejsFunction(
      this,
      "SendProWelcomeEmailLambda",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "handler",
        entry: path.join(
          __dirname,
          "../functions/upgrade-user/send-pro-welcome-email/handler.ts"
        ),
        bundling: {
          minify: true,
          sourceMap: true,
          sourcesContent: false,
          target: "node20",
        },
        environment: {
          USER_TABLE_NAME: userTable.tableName,
          NODE_OPTIONS: "--enable-source-maps",
        },
        timeout: cdk.Duration.seconds(10),
        memorySize: 256,
      }
    );

    // Grant permissions
    userTable.grantReadWriteData(updateUserTierLambda);
    userTable.grantReadData(sendProWelcomeEmailLambda);

    sendProWelcomeEmailLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ses:SendEmail", "ses:SendRawEmail"],
        resources: [
          `arn:aws:ses:${this.region}:${this.account}:identity/vidit0210@gmail.com`,
        ],
      })
    );

    // Grant permission to update Cognito groups
    updateCognitoGroupLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "cognito-idp:AdminAddUserToGroup",
          "cognito-idp:AdminRemoveUserFromGroup",
        ],
        resources: [userPool.userPoolArn],
      })
    );

    // Create Step Functions tasks for upgrade workflow
    const updateCognitoGroupTask = new tasks.LambdaInvoke(
      this,
      "UpdateCognitoGroupTask",
      {
        lambdaFunction: updateCognitoGroupLambda,
        outputPath: "$.Payload",
      }
    );

    const updateUserTierTask = new tasks.LambdaInvoke(
      this,
      "UpdateUserTierTask",
      {
        lambdaFunction: updateUserTierLambda,
        outputPath: "$.Payload",
      }
    );

    const sendProWelcomeEmailTask = new tasks.LambdaInvoke(
      this,
      "SendProWelcomeEmailTask",
      {
        lambdaFunction: sendProWelcomeEmailLambda,
        outputPath: "$.Payload",
        retryOnServiceExceptions: true,
      }
    );

    // Define the upgrade user state machine
    const upgradeUserDefinition = updateCognitoGroupTask
      .next(updateUserTierTask)
      .next(sendProWelcomeEmailTask);

    const upgradeUserStateMachine = new sfn.StateMachine(
      this,
      "UpgradeUserStateMachine",
      {
        stateMachineName: "upgrade-user-to-paid-workflow",
        definitionBody: sfn.DefinitionBody.fromChainable(upgradeUserDefinition),
        timeout: cdk.Duration.minutes(5),
      }
    );

    // Create AppSync resolver Lambda for upgrade user
    const upgradeUserToPaidLambda = new NodejsFunction(
      this,
      "UpgradeUserToPaidLambda",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "handler",
        entry: path.join(
          __dirname,
          "../functions/appsync-resolvers/upgrade-user-to-paid.ts"
        ),
        bundling: {
          minify: true,
          sourceMap: true,
          sourcesContent: false,
          target: "node20",
        },
        environment: {
          USER_POOL_ID: userPool.userPoolId,
          UPGRADE_USER_STATE_MACHINE_ARN:
            upgradeUserStateMachine.stateMachineArn,
          NODE_OPTIONS: "--enable-source-maps",
        },
        timeout: cdk.Duration.seconds(10),
        memorySize: 256,
      }
    );

    // Grant permission to start Step Functions execution
    upgradeUserStateMachine.grantStartExecution(upgradeUserToPaidLambda);

    // Create data source and resolver
    const upgradeUserToPaidDataSource = api.addLambdaDataSource(
      "UpgradeUserToPaidDataSource",
      upgradeUserToPaidLambda
    );

    upgradeUserToPaidDataSource.createResolver("UpgradeUserToPaidResolver", {
      typeName: "Mutation",
      fieldName: "upgradeUserToPaid",
    });
  }
}
