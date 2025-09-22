import { ulid } from 'ulid';

export interface GenerateUserIdInput {
  cognitoUserId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  contactNumber?: string;
}

export interface GenerateUserIdOutput extends GenerateUserIdInput {
  userId: string;
  createdAt: string;
  tier: string;
}

export const handler = async (event: GenerateUserIdInput): Promise<GenerateUserIdOutput> => {
  console.log('Generating user ID for:', event.email);
  
  const userId = ulid();
  const createdAt = new Date().toISOString();
  
  const output: GenerateUserIdOutput = {
    ...event,
    userId,
    createdAt,
    tier: 'user'
  };
  
  console.log('Generated user data:', output);
  return output;
};