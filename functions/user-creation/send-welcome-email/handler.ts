import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

export interface SendWelcomeEmailInput {
  userId: string;
  cognitoUserId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  contactNumber?: string;
  createdAt: string;
  tier: string;
}

const sesClient = new SESClient({});
const SOURCE_EMAIL = process.env.SES_SOURCE_EMAIL || "vidit0210@gmail.com";

export const handler = async (
  event: SendWelcomeEmailInput
): Promise<SendWelcomeEmailInput> => {
  console.log("Event received:", JSON.stringify(event, null, 2));
  console.log("Sending welcome email to user:", event.email);

  const toEmail = event.email as string;

  const name = event.firstName
    ? `${event.firstName} ${event.lastName || ""}`.trim()
    : event.email;

  const emailSubject = "Welcome to Lambda Real Estate - Your Account is Ready!";

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 5px; }
    .content { padding: 20px 0; }
    .details { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px 0; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to Lambda Real Estate!</h1>
    </div>
    <div class="content">
      <p>Hello ${name},</p>
      <p>Welcome to Lambda Real Estate! Your account has been successfully created and is ready to use.</p>
      
      <div class="details">
        <h3>Account Details:</h3>
        <ul>
          <li><strong>Email:</strong> ${event.email}</li>
          <li><strong>Contact Number:</strong> ${event.contactNumber || 'Not provided'}</li>
          <li><strong>User ID:</strong> ${event.userId}</li>
          <li><strong>Account Tier:</strong> ${event.tier}</li>
          <li><strong>Created:</strong> ${new Date(event.createdAt).toLocaleString()}</li>
        </ul>
      </div>
      
      <p>You can now log in and start using our services. If you have any questions or need assistance, please don't hesitate to reach out to our support team.</p>
    </div>
    <div class="footer">
      <p>Best regards,<br>The Lambda Real Estate Team</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const textBody = `
Hello ${name},

Welcome to Lambda Real Estate! Your account has been successfully created and is ready to use.

Account Details:
- Email: ${event.email}
- Contact Number: ${event.contactNumber || 'Not provided'}
- User ID: ${event.userId}
- Account Tier: ${event.tier}
- Created: ${new Date(event.createdAt).toLocaleString()}

You can now log in and start using our services. If you have any questions or need assistance, please don't hesitate to reach out to our support team.

Best regards,
The Lambda Real Estate Team
  `.trim();

  try {
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

    console.log("Welcome email sent successfully:", response.MessageId);

    return event;
  } catch (error) {
    console.error("Error sending welcome email:", error);
    // Don't fail the entire workflow if email fails
    // You might want to implement a retry mechanism or dead letter queue
    return event;
  }
};
