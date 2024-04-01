const express = require('express')
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const PriorityQueue = require('priorityqueuejs');

let availableUserIdQueue = new PriorityQueue((a, b) => a - b);
let availableObjectIdQueue = new PriorityQueue((a, b) => a - b);

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

    console.log(socket.id);

    socket.on("connection", (data) => {
        connectedUsers++;

        console.log("Player has connected. Connected Users: "+ connectedUsers);
        console.log("Number of sockets in map: "+ Object.keys(userSocketIdMap).length);

        if (connectedUsers <= 1) {
            availableUserIdQueue = new PriorityQueue((a,b) => a-b);
            availableObjectIdQueue = new PriorityQueue((a,b) => a-b);
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
            socket.broadcast.emit("spawnObject",
                {
                    senderId: chosenUserId,
                    networkId: chosenNetworkId,
                    prefabReferenceName: "Player",
                    position: {x:-0.04657826, y:4.768372e-07, z:-0.07017983},
                    rotation: {x:0, y:180, z:0}
                });

            socket.emit("spawnScene", JSON.stringify(networkObjectMap));
            console.log("spawning scene");
            printNetworkObjectMap();
        }

        networkObjectMap[chosenNetworkId] = new NetworkGameObject("Player", {x:-0.04657826, y:4.768372e-07, z:-0.07017983}, {x:0, y:180, z:0});
        userSocketIdMap[socket.id] = new UserObject(chosenUserId, chosenNetworkId);

        if (chosenUserId === userIdCounter) userIdCounter++;
        else adjustUserIdCounter();

        if (chosenNetworkId === objectIdCount) objectIdCount++;
        else adjustObjectIdCounter();
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
            //}
            /*            else if (findNumberOfPlayerObjectsInScene()+1 > connectedUsers) {
                            socket.emit("deleteObject",
                                {
                                    id: parsedData.newId
                                });
                        }
                        else {
                            io.emit("spawnObject", {
                                senderId: parsedData.senderId,
                                networkId: parsedData.newId,
                                prefabReferenceName: parsedData.type,
                                position: parsedData.position,
                                rotation: parsedData.rotation
                            });
                        }*/
        }
    });

    socket.on("deleteObject", (data) => {
        try {
            const parsedData = JSON.parse(data);

            socket.broadcast.emit("deleteObject", {
                id: parsedData.id
            });
        } catch (Exception) {}
    });

    socket.on("spawnObject", (data) => {
        console.log("Spawning Network Object")
        const parsedData = JSON.parse(data);

        let chosenNetworkId = objectIdCount;
        if (!availableObjectIdQueue.isEmpty()) chosenNetworkId = availableObjectIdQueue.deq();
        else objectIdCount++;

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
        networkObjectMap[chosenNetworkId] = new NetworkGameObject(parsedData.prefabReferenceName, positionVector, rotationVector);
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

    socket.on("respawnSelf", (data) => {

        if (networkObjectMap.length == 0) {
            socket.emit("sendPersonalNetworkMap", "");
        }

        console.log("Respawning client on network")

        const parsedData = JSON.parse(data);

        connectedUsers++;

        let positionVector = parsedData.positionVector;
        let rotationVector = parsedData.rotationVector;

        let chosenObjectId = parsedData.objectId;
        let chosenUserId = parsedData.senderId;
        if (!networkObjectMap.hasOwnProperty(parsedData.objectId)) {
            console.log("Making new object in network map");

            networkObjectMap[parsedData.objectId] = new NetworkGameObject("Player", {x:positionVector.x, y: positionVector.y, z:positionVector.z}, {x:rotationVector.x, y: rotationVector.y, z:rotationVector.z});

            socket.broadcast.emit("respawnSelf", {
                data: data
            });
        }
        else if (networkObjectMap[parsedData.objectId].prefabName === "Player" && playerObjectHasMatchingSocket(parsedData.objectId, parsedData.senderId)){
            console.log("Modifying object in network map");

            networkObjectMap[parsedData.objectId].positionVector = {x:positionVector.x, y: positionVector.y, z:positionVector.z};
            networkObjectMap[parsedData.objectId].rotationVector = {x:rotationVector.x, y: rotationVector.y, z:rotationVector.z};

            socket.broadcast.emit("respawnSelf", {
                data: data
            });
        }
        else {
            console.log("Correcting ID and making new object in map");

            chosenObjectId = objectIdCount;
            if (!availableObjectIdQueue.isEmpty()) {
                chosenObjectId = availableObjectIdQueue.deq();
            }
            else objectIdCount++;

            socket.broadcast.emit("respawnSelf", {
                data: {
                    senderId: parsedData.senderId,
                    objectId: chosenObjectId,
                    connectedPlayers: connectedUsers,
                    positionVector: {x:positionVector.x, y: positionVector.y, z:positionVector.z},
                    rotationVector: {x:rotationVector.x, y: rotationVector.y, z:rotationVector.z}
                }
            });

            networkObjectMap[chosenObjectId] = new NetworkGameObject("Player", {x:positionVector.x, y: positionVector.y, z:positionVector.z}, {x:rotationVector.x, y: rotationVector.y, z:rotationVector.z});
        }

        for (let socketId in userSocketIdMap) {
            if (userSocketIdMap[socketId].userNetworkId == parsedData.senderId) {
                chosenUserId = userIdCounter;
                if (!availableUserIdQueue.isEmpty()) {
                    chosenUserId = availableUserIdQueue.deq();
                }
                else userIdCounter++;
            }
        }

        if (chosenUserId != parsedData.senderId || chosenObjectId != parsedData.objectId) {
            socket.emit("correctUserId", {
                userId: chosenUserId,
                previousId: parsedData.objectId,
                newId: chosenObjectId
            });
        }

        userSocketIdMap[socket.id] = new UserObject(chosenUserId, chosenObjectId);

        printNetworkObjectMap();

        console.log("Finished reconnection code; Connected Users: "+ connectedUsers);
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
        console.log("Player has disconnected");

        if (socket.id in userSocketIdMap) {
            let userObject = userSocketIdMap[socket.id];
            let json = {
                "objectNetworkId": userObject.objectNetworkId,
                "senderId": userObject.userNetworkId
            };

            disconnectClient(socket, JSON.stringify(json));

            delete userSocketIdMap[socket.id];
        }

        if (connectedUsers <= 0) {
            objectIdCount = 0;
            connectedUsers = 0;
            userIdCounter = 1;
            networkObjectMap = {};
            userSocketIdMap = {};
            networkHostId = -1;
        }
    });
});

function disconnectClient(socket, data) {
    connectedUsers--;
    console.log("Connected Users: "+ connectedUsers);

    const parsedData = JSON.parse(data);

    socket.broadcast.emit("deleteObject",
        {
            id: parsedData.objectNetworkId
        });
    socket.broadcast.emit("disconnectOtherPlayer", "");

    if (parsedData.objectNetworkId in  networkObjectMap) {
        delete networkObjectMap[parsedData.objectNetworkId];
    }

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

    console.log("Finished disconnection code!");
}


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
