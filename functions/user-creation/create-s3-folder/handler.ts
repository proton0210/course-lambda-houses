import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({});
const USER_FILES_BUCKET_NAME = process.env.USER_FILES_BUCKET_NAME!;

export interface CreateS3FolderInput {
  userId: string;
  cognitoUserId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  contactNumber?: string;
  createdAt: string;
  tier: string;
}

export const handler = async (event: CreateS3FolderInput): Promise<CreateS3FolderInput> => {
  console.log('Creating S3 folder for user:', event.userId);
  
  try {
    const folderKey = `${event.userId}/`;
    const putObjectCommand = new PutObjectCommand({
      Bucket: USER_FILES_BUCKET_NAME,
      Key: folderKey,
      ContentType: 'application/x-directory'
    });
    
    await s3Client.send(putObjectCommand);
    console.log(`Created S3 folder: ${folderKey}`);
    
    return event;
  } catch (error) {
    console.error('Error creating S3 folder:', error);
    // Rethrow the error to fail the step
    throw error;
  }
};