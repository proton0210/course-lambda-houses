import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export interface UpdateUserTierInput {
  cognitoUserId: string;
  updatedGroup: string;
}

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export const handler = async (event: UpdateUserTierInput): Promise<UpdateUserTierInput & { tierUpdated: boolean; userId?: string }> => {
  console.log("Event received:", JSON.stringify(event, null, 2));
  
  const { cognitoUserId } = event;
  const userTableName = process.env.USER_TABLE_NAME;
  
  if (!userTableName) {
    throw new Error("USER_TABLE_NAME environment variable is not set");
  }

  try {
    // First, we need to find the user by cognitoUserId using GSI
    const queryCommand = new QueryCommand({
      TableName: userTableName,
      IndexName: "cognitoUserId",
      KeyConditionExpression: "cognitoUserId = :cognitoUserId",
      ExpressionAttributeValues: {
        ":cognitoUserId": cognitoUserId
      }
    });

    const queryResult = await docClient.send(queryCommand);
    
    if (!queryResult.Items || queryResult.Items.length === 0) {
      throw new Error(`User not found with cognitoUserId: ${cognitoUserId}`);
    }

    const user = queryResult.Items[0];
    const userId = user.userId;

    // Now update the user's tier to 'paid' using the userId
    const updateCommand = new UpdateCommand({
      TableName: userTableName,
      Key: {
        userId: userId
      },
      UpdateExpression: "SET #tier = :tier, #updatedAt = :updatedAt",
      ExpressionAttributeNames: {
        "#tier": "tier",
        "#updatedAt": "updatedAt"
      },
      ExpressionAttributeValues: {
        ":tier": "paid",
        ":updatedAt": new Date().toISOString()
      },
      ReturnValues: "ALL_NEW"
    });

    const result = await docClient.send(updateCommand);
    
    console.log(`Successfully updated user ${userId} (cognitoUserId: ${cognitoUserId}) tier to 'paid'`, result.Attributes);

    return {
      ...event,
      tierUpdated: true,
      userId: userId
    };
  } catch (error) {
    console.error("Error updating user tier:", error);
    throw new Error(`Failed to update user tier: ${error}`);
  }
};