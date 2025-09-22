import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

export interface SendProWelcomeEmailInput {
  cognitoUserId: string;
  updatedGroup: string;
  tierUpdated: boolean;
  userId?: string;
}

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const sesClient = new SESClient({});
const SOURCE_EMAIL = process.env.SES_SOURCE_EMAIL || "vidit0210@gmail.com";

export const handler = async (
  event: SendProWelcomeEmailInput
): Promise<SendProWelcomeEmailInput & { emailSent: boolean }> => {
  console.log("Event received:", JSON.stringify(event, null, 2));

  const { cognitoUserId } = event;
  const userTableName = process.env.USER_TABLE_NAME;

  if (!userTableName) {
    throw new Error("USER_TABLE_NAME environment variable is not set");
  }

  try {
    // Fetch user details from DynamoDB using GSI
    const getUserCommand = new QueryCommand({
      TableName: userTableName,
      IndexName: "cognitoUserId",
      KeyConditionExpression: "cognitoUserId = :cognitoUserId",
      ExpressionAttributeValues: {
        ":cognitoUserId": cognitoUserId,
      },
    });

    const userResult = await docClient.send(getUserCommand);

    if (!userResult.Items || userResult.Items.length === 0) {
      console.error(
        `User not found in DynamoDB for cognitoUserId: ${cognitoUserId}`
      );
      return {
        ...event,
        emailSent: false,
      };
    }

    const user = userResult.Items[0]; // Take the first item since cognitoUserId should be unique
    const toEmail = user.email as string;
    const name = user.firstName
      ? `${user.firstName} ${user.lastName || ""}`.trim()
      : user.email;

    const emailSubject = "Welcome to Lambda Real Estate Pro - AI Features Unlocked!";

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px; color: white; }
    .header h1 { margin: 0; font-size: 28px; }
    .content { padding: 30px 0; }
    .pro-badge { display: inline-block; background: #FFD700; color: #333; padding: 8px 20px; border-radius: 20px; font-weight: bold; font-size: 16px; margin: 20px 0; }
    .ai-feature { background-color: #f8f9fa; padding: 25px; border-radius: 10px; margin: 25px 0; border-left: 4px solid #667eea; }
    .ai-feature h3 { color: #667eea; margin-top: 0; }
    .cta { background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0; }
    .footer { text-align: center; padding: 20px 0; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to Pro, ${name}!</h1>
      <div class="pro-badge">PRO MEMBER</div>
    </div>
    <div class="content">
      <p>Your account has been successfully upgraded to Pro status.</p>
      
      <div class="ai-feature">
        <h3>🤖 Bedrock AI Capabilities Now Available</h3>
        <p>As a Pro member, you now have exclusive access to our <strong>Bedrock AI-powered report generation</strong> features:</p>
        <ul style="list-style: none; padding-left: 0;">
          <li style="padding: 8px 0;">📊 <strong>Market Analysis Reports</strong> - Generate comprehensive property market analysis</li>
          <li style="padding: 8px 0;">📈 <strong>Investment Reports</strong> - AI-powered investment potential assessments</li>
          <li style="padding: 8px 0;">🏠 <strong>Comparative Market Analysis</strong> - Instant property comparisons and valuations</li>
          <li style="padding: 8px 0;">📝 <strong>Custom Reports</strong> - Create tailored reports for your specific needs</li>
        </ul>
      </div>
      
      <p>Start using these AI features today to make smarter real estate decisions.</p>
      
      <div style="text-align: center;">
        <a href="#" class="cta">Start Generating AI Reports</a>
      </div>
    </div>
    <div class="footer">
      <p>Best regards,<br>The Lambda Real Estate Team</p>
    </div>
  </div>
</body>
</html>
    `.trim();

    const textBody = `
Welcome to Pro, ${name}!

Your account has been successfully upgraded to Pro status.

🤖 Bedrock AI Capabilities Now Available

As a Pro member, you now have exclusive access to our Bedrock AI-powered report generation features:

📊 Market Analysis Reports - Generate comprehensive property market analysis
📈 Investment Reports - AI-powered investment potential assessments
🏠 Comparative Market Analysis - Instant property comparisons and valuations
📝 Custom Reports - Create tailored reports for your specific needs

Start using these AI features today to make smarter real estate decisions.

Best regards,
The Lambda Real Estate Team
    `.trim();

    const command = new SendEmailCommand({
      Source: SOURCE_EMAIL,
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Subject: { Data: emailSubject },
        Body: {
          Text: { Data: textBody },
          Html: { Data: htmlBody },
        },
      },
      ReplyToAddresses: [SOURCE_EMAIL],
    });

    const response = await sesClient.send(command);

    console.log("Pro welcome email sent successfully:", response.MessageId);

    return {
      ...event,
      emailSent: true,
    };
  } catch (error) {
    console.error("Error sending pro welcome email:", error);
    // Don't fail the entire workflow if email fails
    return {
      ...event,
      emailSent: false,
    };
  }
};
