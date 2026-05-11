const { ConnectClient, StartChatContactCommand } = require("@aws-sdk/client-connect");
const client = new ConnectClient({ region: process.env.REGION });
const parentOrigin = process.env.PARENT_ORIGIN;

exports.handler = (event, context, callback) => {
    const body = JSON.parse(event["body"]);
    console.log(`parent origin in environment: ${parentOrigin}`);

    startChatContact(body).then((startChatResult) => {
        callback(null, buildSuccessfulResponse(startChatResult));
    }).catch((err) => {
        console.log("caught error " + err);
        callback(null, buildResponseFailed(err));
    });
};

async function startChatContact(body) {
    console.log("CF ID: " + process.env.CONTACT_FLOW_ID);
    console.log("Instance ID: " + process.env.INSTANCE_ID);

    let initialMsgContent = "";
    let initialMsgContentType = "";
    if (body.hasOwnProperty("InitialMessage")) {
        if (body["InitialMessage"].hasOwnProperty("Content")) {
            initialMsgContent = body["InitialMessage"]["Content"];

        }
        if (body["InitialMessage"].hasOwnProperty("ContentType")) {
            initialMsgContentType = body["InitialMessage"]["ContentType"];
        }
    }
    
    let attributes = {};
    if (body.hasOwnProperty("Attributes")) {
        attributes = filterConnectAttributes(body["Attributes"]);
    }
    const displayName = body.ParticipantDetails && body.ParticipantDetails.DisplayName
        ? String(body.ParticipantDetails.DisplayName)
        : "Customer";

    const startChat = {
        "InstanceId": process.env.INSTANCE_ID,
        "ContactFlowId": process.env.CONTACT_FLOW_ID,
        "Attributes": attributes,
        "ChatDurationInMinutes": 60,
        "ParticipantDetails": {
            "DisplayName": displayName
        }
    };
    
    if (initialMsgContent && initialMsgContentType != "" ){
        startChat.InitialMessage = {
            "Content": initialMsgContent,
            "ContentType": initialMsgContentType
        };
    };
    
    console.log('startChat params', startChat);
    const command = new StartChatContactCommand(startChat);
    try {
        const response = await client.send(command);
        return response;
    } catch (error) {
        console.log("Error starting the chat.");
        console.log(error, error.stack);
        throw error;
    }
}

function filterConnectAttributes(attributes) {
    if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
        return {};
    }

    return Object.keys(attributes).filter((key) => (
        key === "topic" || key.startsWith("connect_")
    )).reduce((filteredAttributes, key) => {
        if (typeof attributes[key] === "string") {
            filteredAttributes[key] = attributes[key];
        }
        return filteredAttributes;
    }, {});
}

function buildSuccessfulResponse(result) {
    const response = {
        statusCode: 200,
        headers: {
            "Access-Control-Allow-Origin": parentOrigin,
            'Content-Type': 'application/json',
            'Access-Control-Allow-Credentials': true,
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent'
        },
        body: JSON.stringify({
            data: { startChatResult: result }
        })
    };
    console.log("RESPONSE" + JSON.stringify(response));
    return response;
}

function buildResponseFailed(err) {
    const response = {
        statusCode: 500,
        headers: {
            "Access-Control-Allow-Origin": parentOrigin,
            'Content-Type': 'application/json',
            'Access-Control-Allow-Credentials': true,
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'
        },
        body: JSON.stringify({
            data: {
                "Error": err
            }
        })
    };
    return response;
}
