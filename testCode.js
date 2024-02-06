const express = require('express')
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const PriorityQueue = require('priorityqueuejs');

let availableUserIdQueue = new PriorityQueue((a, b) => a - b);
let availableObjectIdQueue = new PriorityQueue((a, b) => a - b);

let shouldCheckObjectIdCounter = false;
let shouldCheckUserIdCounter = false;
let objectIdCount = 0;
let connectedUsers = 0;
let userIdCounter = 1;
let networkObjectMap = {};

http.listen(3000, () => {
   console.log("Server listening on port 3000");
});

io.on("connection", (socket) => {
    connectedUsers++;

    socket.on("connection", (data) => {

        console.log("Player has connected");

        let chosenUserId = userIdCounter;
        if (!availableUserIdQueue.isEmpty()) chosenUserId = availableUserIdQueue.deq();

        let chosenNetworkId = objectIdCount;
        if (!availableObjectIdQueue.isEmpty()) chosenNetworkId = availableObjectIdQueue.deq();

        socket.emit("connection", {
            userNetworkId: chosenUserId,
            networkId: chosenNetworkId
        });

        if (userIdCounter > 1) {
            socket.broadcast.emit("spawnObject",
                {
                    senderId: chosenUserId,
                    networkId: chosenNetworkId,
                    prefabReferenceName: "Player",
                    position: {x:0, y:1, z:0},
                    rotation: {x:0, y:0, z:0}
                });

            socket.emit("spawnScene", JSON.stringify(networkObjectMap));
        }

        networkObjectMap[objectIdCount] = new NetworkGameObject("Player", {x:0, y:1, z:0}, {x:0, y:0, z:0});

        if (chosenUserId === userIdCounter) userIdCounter++;
        else adjustUserIdCounter();

        if (chosenNetworkId === objectIdCount) objectIdCount++;
        else adjustObjectIdCounter();
    });

    socket.on("spawnObject", (data) => {
        const parsedData = JSON.parse(data);

        let chosenNetworkId = objectIdCount;
        if (!availableObjectIdQueue.isEmpty()) chosenNetworkId = availableObjectIdQueue.deq();

        io.emit("spawnObject",
            {
                senderId: parsedData.senderId,
                networkId: chosenNetworkId,
                prefabReferenceName: parsedData.prefabReferenceName,
                position: parsedData.position,
                rotation: parsedData.rotation
            });

        let positionJson = parsedData.position;
        let rotationJson = parsedData.rotation;
        let positionVector = {x:positionJson.x, y:positionJson.y, z:positionJson.z};
        let rotationVector = {x:rotationJson.x, y:rotationJson.y, z:rotationJson.z};
        networkObjectMap[objectIdCount] = new NetworkGameObject(parsedData.prefabReferenceName, positionVector, rotationVector);

        if (chosenNetworkId === objectIdCount) objectIdCount++;
        else adjustObjectIdCounter();
    });

    // Updates positions of objects client side and server side
    socket.on("updatePositions", (data) => {
        const parsedData = JSON.parse(data);

        socket.broadcast.emit("updatePositions",
            {
                data: data
            });

        // console.log(data);

        for (const networkObject of parsedData.objects) {
            let position = networkObject.position;
            let rotation = networkObject.rotation;
            networkObjectMap[networkObject.networkId].positionVector = {x:position.x, y:position.y, z:position.z};
            networkObjectMap[networkObject.networkId].rotationVector = {x:rotation.x, y:rotation.y, z:rotation.z};
        }
    });

    socket.on("disconnectClient", (data) => {
        const parsedData = JSON.parse(data);

        delete networkObjectMap[parsedData.objectNetworkId];

        if (Number(parsedData.senderId) === userIdCounter-1) {
            userIdCounter--;
            adjustUserIdCounter();
        }
        else {
            availableUserIdQueue.enq(Number(parsedData.senderId));
        }

        if (Number(parsedData.objectNetworkId) === objectIdCount-1) {
            objectIdCount--;
            adjustObjectIdCounter();
        }
        else {
            availableObjectIdQueue.enq(Number(parsedData.objectNetworkId));
        }
    });

    socket.on("disconnect", () => {
       console.log("Player has disconnected");
       connectedUsers--;
    });
});

function adjustObjectIdCounter() {
    if (availableObjectIdQueue.isEmpty()) return;

    let redo = true;
    let parentQueue = availableObjectIdQueue;
    let tmpQueue = new PriorityQueue((a, b) => a - b);
    while (redo) {
        redo = false;

        while (!parentQueue.isEmpty()) {
            let val = parentQueue.deq();
            if (val === objectIdCount) {
                objectIdCount--;

                delete networkObjectMap[val];

                redo = true;
            }
            else {
                tmpQueue.enq(val);
            }
        }

        if (redo) {
            parentQueue = tmpQueue;
            tmpQueue = new PriorityQueue((a, b) => a - b);
        }
    }

    availableObjectIdQueue = tmpQueue;
}

function adjustUserIdCounter() {
    if (availableUserIdQueue.isEmpty()) return;

    let redo = true;
    let parentQueue = availableUserIdQueue;
    let tmpQueue = new PriorityQueue((a, b) => a - b);
    while (redo) {
        redo = false;

        while (!parentQueue.isEmpty()) {
            let val = parentQueue.deq();
            if (val === userIdCounter) {
                userIdCounter--;
                redo = true;
            }
            else {
                tmpQueue.enq(val);
            }
        }

        if (redo) {
            parentQueue = tmpQueue;
            tmpQueue = new PriorityQueue((a, b) => a - b);
        }
    }
    availableUserIdQueue = tmpQueue;
}

class NetworkGameObject {
    constructor(prefabName, positionVector, rotationVector) {
        this.prefabName = prefabName;
        this.positionVector = positionVector;
        this.rotationVector = rotationVector;
    }
}
