import { CognitoIdentityProviderClient, AdminAddUserToGroupCommand, AdminRemoveUserFromGroupCommand } from "@aws-sdk/client-cognito-identity-provider";

export interface UpdateCognitoGroupInput {
  cognitoUserId: string;
}

const cognitoClient = new CognitoIdentityProviderClient({});

export const handler = async (event: UpdateCognitoGroupInput): Promise<UpdateCognitoGroupInput & { updatedGroup: string }> => {
  console.log("Event received:", JSON.stringify(event, null, 2));
  
  const { cognitoUserId } = event;
  const userPoolId = process.env.USER_POOL_ID;
  
  if (!userPoolId) {
    throw new Error("USER_POOL_ID environment variable is not set");
  }

  try {
    // First, remove the user from the 'user' group if they're in it
    try {
      await cognitoClient.send(new AdminRemoveUserFromGroupCommand({
        UserPoolId: userPoolId,
        Username: cognitoUserId,
        GroupName: "user"
      }));
      console.log(`Removed user ${cognitoUserId} from 'user' group`);
    } catch (error: any) {
      // It's okay if the user wasn't in the group
      if (error.name !== 'ResourceNotFoundException') {
        console.warn(`Failed to remove user from 'user' group:`, error);
      }
    }

    // Add user to the 'paid' group
    await cognitoClient.send(new AdminAddUserToGroupCommand({
      UserPoolId: userPoolId,
      Username: cognitoUserId,
      GroupName: "paid"
    }));
    
    console.log(`Successfully added user ${cognitoUserId} to 'paid' group`);

    return {
      ...event,
      updatedGroup: "paid"
    };
  } catch (error) {
    console.error("Error updating user group:", error);
    throw new Error(`Failed to update user group: ${error}`);
  }
};