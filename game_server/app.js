const express = require('express')
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const PriorityQueue = require('priorityqueuejs');
const e = require("express");

let availableUserIdQueue = new PriorityQueue((a, b) => b-a);
let availableObjectIdQueue = new PriorityQueue((a, b) => b-a);

let objectIdCount = 0;
let connectedUsers = 0;
let userIdCounter = 1;
let networkObjectMap = {};
let userSocketIdMap = {}

let networkHostId = -1;

http.listen(3000, () => {
    console.log("Server listening on port 3000");
});

io.on("connection", (socket) => {
    socket.on("connection", (data) => {
        connectedUsers++;

        console.log("Player has connected. Connected Users: "+ connectedUsers);

        if (connectedUsers <= 1) {
            availableUserIdQueue = new PriorityQueue((a,b) => b-a);
            availableObjectIdQueue = new PriorityQueue((a,b) => b-a);
            networkObjectMap = {};
            userSocketIdMap = {}
            networkHostId = -1;
            userIdCounter = 1;
        }

        let chosenUserId = userIdCounter;
        if (!availableUserIdQueue.isEmpty()) chosenUserId = availableUserIdQueue.deq();

        let chosenNetworkId = objectIdCount;
        if (!availableObjectIdQueue.isEmpty()) chosenNetworkId = availableObjectIdQueue.deq();

        let isHost = false;
        if (networkHostId === -1) {
            isHost = true;
            networkHostId = chosenUserId;
        }

        socket.emit("connection", {
            userNetworkId: chosenUserId,
            networkId: chosenNetworkId,
            isHost: isHost
        });

        if (userIdCounter > 1) {
            socket.broadcast.emit("spawnObjects",
                {
                    senderId: chosenUserId,
                    list: [{
                        networkId: chosenNetworkId,
                        prefabReferenceName: "Player",
                        position: {x:-0.04657826, y:4.768372e-07, z:-0.07017983},
                        rotation: {x:0, y:180, z:0}
                    }]
                });

            socket.emit("spawnScene", JSON.stringify(networkObjectMap));
            console.log("Spawning Scene");
            printNetworkObjectMap();
        }

        networkObjectMap[chosenNetworkId] = new NetworkGameObject("Player", {x:-0.04657826, y:4.768372e-07, z:-0.07017983}, {x:0, y:180, z:0});
        userSocketIdMap[socket.id] = new UserObject(chosenUserId, chosenNetworkId);

        if (chosenUserId === userIdCounter) userIdCounter++;
        else adjustUserIdCounter();

        if (chosenNetworkId === objectIdCount) objectIdCount++;
        else adjustObjectIdCounter();
    });

    socket.on("refreshConnection", (data) =>{
        console.log("Refreshing Connection");

        delete userSocketIdMap[socket.id];

        socket.disconnect(true);
    });

    socket.on("setPersonalIds", (data) => {
        console.log("Setting Personal IDs");

        const parsedData = JSON.parse(data);

        userSocketIdMap[socket.id] = new UserObject(parsedData.userNetworkId, parsedData.objectNetworkId);
    });

    socket.on("idCorrection", (data) => {
        console.log("Correcting ID");
        const parsedData = JSON.parse(data);

        if (!networkObjectMap.hasOwnProperty(parsedData.previousId)){
            socket.emit("correctObjectMap", JSON.stringify(networkObjectMap));
            console.log("Sending user correct object map");
        }
        else /*{if (networkObjectMap.hasOwnProperty(parsedData.previousId))*/ {
            networkObjectMap[parsedData.newId] = networkObjectMap[parsedData.previousId];
            delete networkObjectMap[parsedData.previousId];

            socket.broadcast.emit("correctId", {
                previousId: parsedData.previousId,
                newId: parsedData.newId
            });
        }
    });

    socket.on("deleteObject", (data) => {
        try {
            const parsedData = JSON.parse(data);

            socket.broadcast.emit("deleteObject", {
                id: parsedData.id
            });

            if (networkObjectMap.hasOwnProperty(parsedData.id)) {
                delete networkObjectMap[parsedData.id];
            }

        } catch (Exception) {}
    });

    socket.on("spawnObjects", (data) => {
        const parsedData = JSON.parse(data);

        let listToSend = [];
        for (let objectReference of parsedData.list) {
            let chosenNetworkId = objectIdCount;
            if (!availableObjectIdQueue.isEmpty()) chosenNetworkId = availableObjectIdQueue.deq();
            else objectIdCount++;

            listToSend.push({
                networkId: chosenNetworkId,
                prefabReferenceName: objectReference.prefabReferenceName,
                position: objectReference.position,
                rotation: objectReference.rotation
            });

            let positionJson = objectReference.position;
            let rotationJson = objectReference.rotation;
            let positionVector = {x:positionJson.x, y:positionJson.y, z:positionJson.z};
            let rotationVector = {x:rotationJson.x, y:rotationJson.y, z:rotationJson.z};
            networkObjectMap[chosenNetworkId] = new NetworkGameObject(objectReference.prefabReferenceName, positionVector, rotationVector);
        }

        io.emit("spawnObjects",
            {
                senderId: parsedData.senderId,
                list: listToSend
            });
    });

    socket.on("sendJump", (data) => {
        socket.broadcast.emit("sendJump", {
            data: data
        });
    });

    socket.on("sendShootingObjects", (data) =>
    {
        socket.broadcast.emit("sendShootingObjects", {
            data: data
        });
    });

    socket.on("updateNetworkMapFromClient", (data) => {
        console.log("Updating network map");

        const parsedData = JSON.parse(data);

        let newNetworkMapTemp = {};
        let objectsToSpawn = {};
        let objectsToDelete = [];

        for (let id in parsedData) {
            let positionVector = {
                x: parsedData[id].positionVector.x,
                y: parsedData[id].positionVector.y,
                z: parsedData[id].positionVector.z
            };
            let rotationVector = {
                x: parsedData[id].rotationVector.x,
                y: parsedData[id].rotationVector.y,
                z: parsedData[id].rotationVector.z
            }

            newNetworkMapTemp[id] = new NetworkGameObject(parsedData[id].prefabName, positionVector, rotationVector);
        }

        networkObjectMap = newNetworkMapTemp;

        socket.broadcast.emit("correctObjectMap", JSON.stringify(networkObjectMap));
    });

    // Updates positions of objects client side and server side
    socket.on("updatePlayerPositions", (data) => {
        const parsedData = JSON.parse(data);

        socket.broadcast.emit("updatePlayerPositions",
            {
                data: data
            });

        for (const networkObject of parsedData.objects) {
            let position = networkObject.position;
            let rotation = networkObject.rotation;
            try {
                networkObjectMap[networkObject.networkId].positionVector = {
                    x: position.x,
                    y: position.y,
                    z: position.z
                };
                networkObjectMap[networkObject.networkId].rotationVector = {
                    x: rotation.x,
                    y: rotation.y,
                    z: rotation.z
                };
            } catch(Exception){}
        }
    });

    socket.on("updateEnemyData", (data) => {
        const parsedData = JSON.parse(data);

        socket.broadcast.emit("updateEnemyData", {
            data: data
        });

        for (const networkObject in parsedData.objects) {
            let position = networkObject.position;
            let rotation = networkObject.rotation;
            try {
                networkObjectMap[networkObject.networkId].positionVector = {
                    x: position.x,
                    y: position.y,
                    z: position.z
                };
                networkObjectMap[networkObject.networkId].rotationVector = {
                    x: rotation.x,
                    y: rotation.y,
                    z: rotation.z
                };
            } catch(Exception){}
        }
    });

    socket.on("updateAIThatTookDamage", (data) => {
        socket.broadcast.emit("updateAIThatTookDamage", {
            data: data
        });
    });

    socket.on("updateChangedAnimations", (data) => {
        socket.broadcast.emit("updateChangedAnimations", {
            data: data
        });
    });

    socket.on("updateChangedParticles", (data) => {
        socket.broadcast.emit("updateChangedParticles", {
            data: data
        });
    });

    socket.on("sendPlayerDamage", (data) => {
        socket.broadcast.emit("sendPlayerDamage", {
            data: data
        });
    });

    socket.on("killSelfOnNetwork", (data) => {
        socket.broadcast.emit("killSelfOnNetwork", {
            data: data
        });
    });

    socket.on("changeWeapon", (data) => {
        socket.broadcast.emit("changeWeapon", {
            data: data
        });
    });

    socket.on("sendAudio", (data) => {
        socket.broadcast.emit("sendAudio", {
            data: data
        });
    });

    socket.on("endGame", (data) => {
        io.emit("endGame", "");
    });

    socket.on("reportStoppedPosition", (data) => {
        const parsedData = JSON.parse(data);

        socket.broadcast.emit("reportStoppedPosition",
            {
                data: data
            });

        let position = parsedData.position;
        let rotation = parsedData.rotation;
        try {
            networkObjectMap[parsedData.networkId].positionVector = {
                x: position.x,
                y: position.y,
                z: position.z
            };
            networkObjectMap[parsedData.networkId].rotationVector = {
                x: rotation.x,
                y: rotation.y,
                z: rotation.z
            };
        } catch (Exception) {}
    });

    socket.on("disconnectClient", (data) => {
        disconnectClient(socket, data);
    });

    socket.on("disconnect", () => {
        if (userSocketIdMap.hasOwnProperty(socket.id)) {
            let userObject = userSocketIdMap[socket.id];
            let json = {
                "objectNetworkId": userObject.objectNetworkId,
                "senderId": userObject.userNetworkId
            };

            disconnectClient(socket, JSON.stringify(json));
        }
    });
});

function disconnectClient(socket, data) {
    console.log("Disconnection ID: "+ socket.id);
    if (!userSocketIdMap.hasOwnProperty(socket.id)) {
        console.log("Did not find ID for disconnection");
        return;
    }

    connectedUsers--;
    console.log("Connected Users after Disconnection: "+ connectedUsers);

    const parsedData = JSON.parse(data);

    socket.broadcast.emit("deleteObject",
        {
            id: parsedData.objectNetworkId
        });
    socket.broadcast.emit("disconnectOtherPlayer", "");

    if (parsedData.objectNetworkId in  networkObjectMap) {
        delete networkObjectMap[parsedData.objectNetworkId];
    }

    availableUserIdQueue.enq(Number(parsedData.senderId));
    adjustUserIdCounter();

    availableObjectIdQueue.enq(Number(parsedData.objectNetworkId));
    adjustObjectIdCounter();

    if (userSocketIdMap.hasOwnProperty(socket.id)) {
        delete userSocketIdMap[socket.id];
    }
    else {
        for (let key in userSocketIdMap) {
            if (userSocketIdMap[key].userNetworkId == data.senderId){
                delete userSocketIdMap[key];
            }
        }
    }

    if (connectedUsers > 0 && networkHostId == parsedData.senderId) {
        let chosenId = -1;
        for (let key in userSocketIdMap) {
            chosenId = userSocketIdMap[key].userNetworkId;
            break;
        }
        networkHostId = chosenId;

        if (networkHostId != -1) {
            io.emit("setHost", {
                userNetworkId: networkHostId,
                isHost: true
            });
        }
    }

    delete userSocketIdMap[socket.id];

    if (connectedUsers <= 0) {
        objectIdCount = 0;
        connectedUsers = 0;
        userIdCounter = 1;
        networkObjectMap = {};
        userSocketIdMap = {};
        networkHostId = -1;
    }

    console.log("Player has disconnected");
}


function adjustObjectIdCounter() {
    while (!availableObjectIdQueue.isEmpty() && availableObjectIdQueue.peek() === objectIdCount-1){
        objectIdCount--;
        availableObjectIdQueue.deq();
    }
}

function adjustUserIdCounter() {
    while (!availableUserIdQueue.isEmpty() && availableUserIdQueue.peek() === userIdCounter) {
        userIdCounter--;
        availableUserIdQueue.deq();
    }
}

function playerObjectHasMatchingSocket(objectId, senderId) {
    for (let socketId in userSocketIdMap) {
        let socketObject = userSocketIdMap[socketId];
        if (socketObject.objectNetworkId == objectId && socketObject.userNetworkId == senderId){
            console.log("Returning true from socket match test");
            return true;
        }
    }
    console.log("Returning false from socket match test");
    return false;
}

function printNetworkObjectMap() {
    for (const key in networkObjectMap) {
        console.log(key +": "+ networkObjectMap[key].prefabName);
    }
}

class NetworkGameObject {
    constructor(prefabName, positionVector, rotationVector) {
        this.prefabName = prefabName;
        this.positionVector = positionVector;
        this.rotationVector = rotationVector;
    }
}

class UserObject {
    constructor(userNetworkId, objectNetworkId) {
        this.userNetworkId = userNetworkId;
        this.objectNetworkId = objectNetworkId;
    }
}
