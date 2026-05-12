const { ConnectClient, StartChatContactCommand } = require("@aws-sdk/client-connect");
const client = new ConnectClient({ region: process.env.REGION });
const parentOrigin = process.env.PARENT_ORIGIN;
const allowedAttributeNamePattern = /^[A-Za-z0-9_.:-]{1,128}$/;

exports.handler = (event, context, callback) => {
    console.log("Received event: " + JSON.stringify(event));
    const body = JSON.parse(event["body"]);
    console.log(`parent origin in environment: ${parentOrigin}`);

    startChatContact(body).then((startChatResult) => {
        callback(null, buildSuccessfulResponse(startChatResult));
    }).catch((err) => {
        console.log("caught error " + err);
        callback(null, buildResponseFailed(err));
    });
};

function sanitizeContactAttributes(attributes) {
    if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
        return {};
    }

    return Object.keys(attributes).filter((key) => {
        return (key === "topic" || key.startsWith("connect_")) && allowedAttributeNamePattern.test(key);
    }).reduce((sanitized, key) => {
        const value = attributes[key];
        if (["string", "number", "boolean"].includes(typeof value)) {
            sanitized[key] = String(value);
        }
        return sanitized;
    }, {});
}

async function startChatContact(body) {
    if (!process.env.CONTACT_FLOW_ID || !process.env.INSTANCE_ID) {
        throw new Error("Connect instance and contact flow must be configured");
    }

    let initialMsgContent = "";
    let initialMsgContentType = "";
    if (body.hasOwnProperty("InitialMessage")) {
        if (body["InitialMessage"].hasOwnProperty("Content") && typeof body["InitialMessage"]["Content"] === "string") {
            initialMsgContent = body["InitialMessage"]["Content"];

        }
        if (body["InitialMessage"].hasOwnProperty("ContentType") && typeof body["InitialMessage"]["ContentType"] === "string") {
            initialMsgContentType = body["InitialMessage"]["ContentType"];
        }
    }
    
    const attributes = sanitizeContactAttributes(body["Attributes"]);

    const startChat = {
        "InstanceId": process.env.INSTANCE_ID,
        "ContactFlowId": process.env.CONTACT_FLOW_ID,
        "Attributes": attributes,
        "ChatDurationInMinutes": 60,
        "ParticipantDetails": {
            "DisplayName": body["ParticipantDetails"]["DisplayName"]
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
    const response = await client.send(command);
    return response;
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
