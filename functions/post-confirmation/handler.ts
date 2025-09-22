import {
  PostConfirmationTriggerHandler,
  PostConfirmationTriggerEvent,
} from "aws-lambda";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const sfnClient = new SFNClient({});
const cognitoClient = new CognitoIdentityProviderClient({});
const STATE_MACHINE_ARN = process.env.USER_CREATION_STATE_MACHINE_ARN!;

export const handler: PostConfirmationTriggerHandler = async (
  event: PostConfirmationTriggerEvent
) => {
  console.log(
    "PostConfirmation trigger received event:",
    JSON.stringify(event, null, 2)
  );

  const { userAttributes } = event.request;
  const {
    sub,
    email,
    "custom:firstName": firstName,
    "custom:lastName": lastName,
    "custom:contactNumber": contactNumber,
  } = userAttributes;

  try {
    // Add user to the 'user' group
    console.log('Adding user to "user" group...');
    const addUserToGroupCommand = new AdminAddUserToGroupCommand({
      UserPoolId: event.userPoolId,
      Username: event.userName,
      GroupName: "user",
    });

    await cognitoClient.send(addUserToGroupCommand);
    console.log('User successfully added to "user" group');

    // Prepare input for Step Functions
    const stateMachineInput = {
      cognitoUserId: sub,
      email,
      firstName: firstName || "",
      lastName: lastName || "",
      contactNumber: contactNumber || "",
    };

    console.log(
      "Starting Step Functions execution with input:",
      stateMachineInput
    );

    // Start Step Functions execution
    const startExecutionCommand = new StartExecutionCommand({
      stateMachineArn: STATE_MACHINE_ARN,
      name: `user-creation-${sub}-${Date.now()}`,
      input: JSON.stringify(stateMachineInput),
    });

    const response = await sfnClient.send(startExecutionCommand);
    console.log("Step Functions execution started:", response.executionArn);

    // Return the event to continue the authentication flow
    return event;
  } catch (error) {
    console.error("Error in PostConfirmation trigger:", error);
    throw error;
  }
};
