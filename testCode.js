const express = require('express')
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

let objectIdCount = 0;
let connectedUsers = 0;
let networkObjectMap = {};

http.listen(3000, () => {
   console.log("Server listening on port 3000");
});

io.on("connection", (socket) => {
    console.log("Player has connected");
    connectedUsers++;

    socket.on("connection", (data) => {
        socket.emit("connection", {
            userNetworkId: connectedUsers,
            networkId: objectIdCount
        });

        if (connectedUsers > 1) {
            socket.broadcast.emit("spawnObject",
                {
                    senderId: connectedUsers,
                    networkId: objectIdCount,
                    prefabReferenceName: "Player",
                    position: {x:0, y:1, z:0},
                    rotation: {x:0, y:0, z:0}
                });

            socket.emit("spawnScene", JSON.stringify(networkObjectMap));
        }

        networkObjectMap[objectIdCount] = new NetworkGameObject("Player", {x:0, y:1, z:0}, {x:0, y:0, z:0});

        objectIdCount++;
    });

    socket.on("spawnObject", (data) => {
        const parsedData = JSON.parse(data);

        io.emit("spawnObject",
            {
                senderId: parsedData.senderId,
                networkId: objectIdCount,
                prefabReferenceName: parsedData.prefabReferenceName,
                position: parsedData.position,
                rotation: parsedData.rotation
            });

        let positionJson = parsedData.position;
        let rotationJson = parsedData.rotation;
        let positionVector = {x:positionJson.x, y:positionJson.y, z:positionJson.z};
        let rotationVector = {x:rotationJson.x, y:rotationJson.y, z:rotationJson.z};
        networkObjectMap[objectIdCount] = new NetworkGameObject(parsedData.prefabReferenceName, positionVector, rotationVector);

        objectIdCount++;
    });

    // Updates positions of objects client side and server side
    socket.on("updatePositions", (data) => {
        const parsedData = JSON.parse(data);

        socket.broadcast.emit("updatePositions",
            {
                data: data
            });

        for (const networkObject of parsedData.objects) {
            let position = networkObject.position;
            let rotation = networkObject.rotation;
            networkObjectMap[networkObject.networkId].positionVector = {x:position.x, y:position.y, z:position.z};
            networkObjectMap[networkObject.networkId].rotationVector = {x:rotation.x, y:rotation.y, z:rotation.z};
        }
    });

    socket.on("disconnect", () => {
       console.log("Player has disconnected");
       connectedUsers--;
    });
});

class NetworkGameObject {
    constructor(prefabName, positionVector, rotationVector) {
        this.prefabName = prefabName;
        this.positionVector = positionVector;
        this.rotationVector = rotationVector;
    }
}
