import * as cdk from 'aws-cdk-lib';
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from 'constructs';
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
        },
      }
    );

    // Grant permissions
    userTable.grantWriteData(createDynamoDBUserLambda);
    userFilesBucket.grantWrite(createS3FolderLambda);

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
        definition,
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
        resources: [`arn:aws:cognito-idp:${this.region}:${this.account}:userpool/*`],
      })
    );

    // Add state machine ARN to PostConfirmation Lambda environment
    postConfirmationLambda.addEnvironment(
      "USER_CREATION_STATE_MACHINE_ARN",
      userCreationStateMachine.stateMachineArn
    );
  }
}
