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

    networkObjectMap[objectIdCount] = new NetworkObject(objectIdCount, "Player", {x: 0, y: 0, z: 0});

    socket.on("connection", (data) => {
        socket.emit("connection", {
            userNetworkId: connectedUsers,
            networkId: objectIdCount
        });

        if (connectedUsers > 1) {
           console.log(objectIdCount);
            io.emit("spawnObject",
                {
                    senderId: connectedUsers,
                    networkId: objectIdCount,
                    prefabReferenceName: "Player",
                    position: {x:0, y:1, z:0}
                });
        }
        objectIdCount++;
    });

    socket.on("spawnObject", (data) => {
        const parsedData = JSON.parse(data);

        io.emit("spawnObject",
            {
                senderId: parsedData.senderId,
                networkId: objectIdCount,
                prefabReferenceName: parsedData.prefabReferenceName,
                position: parsedData.position
            });

        objectIdCount++;
    });

    socket.on("updatePositions", (data) => {
        const parsedData = JSON.parse(data);
        console.log("Updating positions: "+ parsedData.senderId);

        //console.log(data); // Validate

        io.emit("updatePositions",
            {
                data: data
            });
    });

    socket.on("disconnect", () => {
       console.log("Player has disconnected");
       connectedUsers--;
    });
});

class NetworkObject {
    constructor(id, prefabName, positionVector) {
        this.id = id;
        this.prefabName = prefabName;
        this.positionVector = positionVector;
    }
}
