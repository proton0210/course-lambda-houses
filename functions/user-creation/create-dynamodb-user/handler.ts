import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { PutCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const USER_TABLE_NAME = process.env.USER_TABLE_NAME!;

export interface CreateDynamoDBUserInput {
  userId: string;
  cognitoUserId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  contactNumber?: string;
  createdAt: string;
  tier: string;
}

interface User {
  userId: string;
  cognitoUserId: string;
  firstName: string;
  lastName: string;
  contactNumber: string;
  email: string;
  createdAt: string;
  tier: string;
}

export const handler = async (event: CreateDynamoDBUserInput): Promise<CreateDynamoDBUserInput> => {
  console.log('Creating user in DynamoDB:', event);
  
  const user: User = {
    userId: event.userId,
    cognitoUserId: event.cognitoUserId,
    firstName: event.firstName || '',
    lastName: event.lastName || '',
    contactNumber: event.contactNumber || '',
    email: event.email,
    createdAt: event.createdAt,
    tier: event.tier
  };
  
  try {
    const putCommand = new PutCommand({
      TableName: USER_TABLE_NAME,
      Item: user,
      ConditionExpression: 'attribute_not_exists(userId)'
    });
    
    await docClient.send(putCommand);
    console.log(`User ${event.email} created successfully in DynamoDB with userId: ${event.userId}`);
    
    return event;
  } catch (error) {
    console.error('Error creating user in DynamoDB:', error);
    throw error;
  }
};