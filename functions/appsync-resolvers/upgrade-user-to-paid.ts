import { AppSyncResolverHandler } from "aws-lambda";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { AppSyncIdentityCognito } from "aws-lambda";

const sfnClient = new SFNClient({});

interface UpgradeUserToPaidArgs {
  cognitoUserId: string;
}

interface UpgradeUserResponse {
  success: boolean;
  message: string;
  executionArn?: string;
}

export const handler: AppSyncResolverHandler<
  UpgradeUserToPaidArgs,
  UpgradeUserResponse
> = async (event) => {
  console.log("Event received:", JSON.stringify(event, null, 2));

  const { cognitoUserId } = event.arguments;
  const userPoolId = process.env.USER_POOL_ID;
  const stateMachineArn = process.env.UPGRADE_USER_STATE_MACHINE_ARN;

  // Verify the requesting user
  const requestingUserId =
    (event.identity as AppSyncIdentityCognito)?.username ||
    (event.identity as AppSyncIdentityCognito)?.sub;

  // Users can only upgrade themselves, unless they're an admin
  const isAdmin = (event.identity as AppSyncIdentityCognito)?.groups?.includes(
    "admin"
  );

  if (!isAdmin && requestingUserId !== cognitoUserId) {
    return {
      success: false,
      message: "Unauthorized: You can only upgrade your own account",
    };
  }

  if (!userPoolId || !stateMachineArn) {
    console.error("Missing required environment variables");
    return {
      success: false,
      message: "Server configuration error",
    };
  }

  try {
    // Check if user is already in paid group
    const currentGroups =
      (event.identity as AppSyncIdentityCognito)?.groups || [];
    if (currentGroups.includes("paid")) {
      return {
        success: false,
        message: "User is already a paid member",
      };
    }

    // Start the Step Functions execution
    const executionName = `upgrade-user-${cognitoUserId}-${Date.now()}`;

    const startExecutionCommand = new StartExecutionCommand({
      stateMachineArn: stateMachineArn,
      name: executionName,
      input: JSON.stringify({
        cognitoUserId,
      }),
    });

    const response = await sfnClient.send(startExecutionCommand);

    console.log(`Started upgrade workflow execution: ${response.executionArn}`);

    return {
      success: true,
      message: "User upgrade process initiated successfully",
      executionArn: response.executionArn,
    };
  } catch (error) {
    console.error("Error starting upgrade workflow:", error);

    return {
      success: false,
      message: "Failed to initiate user upgrade process",
    };
  }
};
