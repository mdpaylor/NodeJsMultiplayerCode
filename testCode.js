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
            io.emit("spawnObject",
                {
                    senderId: connectedUsers,
                    networkId: objectIdCount,
                    prefabReferenceName: "Player",
                    position: {x:0, y:1, z:0}
                });

            socket.emit("spawnScene", JSON.stringify(networkObjectMap));
        }

        networkObjectMap[objectIdCount] = new NetworkObject("Player", {x:0, y:1, z:0});

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

    // Updates positions of objects client side and server side
    socket.on("updatePositions", (data) => {
        const parsedData = JSON.parse(data);

        io.emit("updatePositions",
            {
                data: data
            });

        for (const networkObject of parsedData.objects) {
            let position = networkObject.position;
            networkObjectMap[networkObject.networkId].positionVector = {x:position.x, y:position.y, z:position.z};
        }
    });

    socket.on("disconnect", () => {
       console.log("Player has disconnected");
       connectedUsers--;
    });
});

class NetworkObject {
    constructor(prefabName, positionVector) {
        this.prefabName = prefabName;
        this.positionVector = positionVector;
    }
}
