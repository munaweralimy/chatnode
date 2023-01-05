import { createServer } from 'http';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { saveSession, findSession, findAllSession } from './src/sessionStorage.js';
import { findMessagesForUser, saveMessage } from './src/messageStorage.js';

const port= 4500 ;
const httpServer = createServer();
const io = new Server(httpServer, {
    cors: {
        origin: "http://localhost:8080",
        methods: ["GET", "POST"]
    }
});

io.use((socket, next) => {
    const sessionId = socket.handshake.auth.sessionId;
    if (sessionId) {
        const session = findSession(sessionId)
        if (session) {
            socket.sessionId = sessionId;
            socket.userId = session.userId;
            socket.username = session.username;
            socket.name = session.name;
            socket.img = session.img;
            return next();    
        } else {
            next(new Error("Invalid session"));
        }
        
    } 
    const username = socket.handshake.auth.username;
    const name = socket.handshake.auth.name;
    const img = socket.handshake.auth.img;
    if (!username) {
        return next(new Error("Invalid Username"))
    }
    socket.username = username;
    socket.userId = uuidv4();
    socket.sessionId = uuidv4();
    socket.name = name;
    socket.img = img;
    next();
})

function getMessagesForUser(userId) {
    const messagesPerUser = new Map();
    findMessagesForUser(userId).forEach((message) => {
        const { from, to } = message;
        const otherUser = userId === from ? to : from;
        if(messagesPerUser.has(otherUser)) {
            messagesPerUser.get(otherUser).push(message);
        } else {
            messagesPerUser.set(otherUser, [message]);
        }
    })
    return messagesPerUser;
}

io.on("connection", async (socket) => {
    console.log('connect', socket.name)
    saveSession(socket.sessionId, {
        userId: socket.userId,
        username: socket.username,
        name: socket.name,
        img: socket.img,
        connected: true
    })

    socket.join(socket.userId);
    const users = [];
    const userMessages = getMessagesForUser(socket.userId)
    findAllSession().forEach((session) => {
        console.log('chain', userMessages.get(session.userId))
        if (session.userId !== socket.userId) {
            users.push({
                userId: session.userId, 
                username: session.username,
                name: session.name,
                img: session.img,
                connected: session.connected,
                messages: userMessages.get(session.userId) || [],
            });
        }
    })

    socket.emit("users", users);

    socket.emit("session", { 
        sessionId: socket.sessionId, 
        userId: socket.userId, 
        username: socket.username, 
        name: socket.name, 
        img: socket.img 
    })

    socket.broadcast.emit("user connected", {
        userId: socket.userId,
        username: socket.username,
        name: socket.name,
        img: socket.img
    })

    socket.on("private message", ({ content, to}) => {
        console.log('socket id', socket.userId)
        const message = {
            from: socket.userId,
            to,
            content,
        }
        socket.to(to).emit("private message", message);
        saveMessage(message);
    })

    socket.on("user messages", ({ userId, username, name, img }) => {
        const userMessages = getMessagesForUser(socket.userId);
        socket.emit("user messages", {
            userId,
            username,
            name,
            img,
            messages: userMessages.get(userId) || [],
        })
    })

    socket.on("disconnect", async() => {
        console.log('disconnect', socket.name)
        const matchingSockets = await io.in(socket.userId).allSockets()
        const isDisconnected = matchingSockets.size === 0;
        if (isDisconnected) {

            //notify others
            socket.broadcast.emit("user disconnected", {
                userId: socket.userId,
                username: socket.username,
                name: socket.name,
                img: socket.img
            });

            // update status
            saveSession(socket.sessionId, {
                userId: socket.userId,
                username: socket.username,
                name: socket.name,
                img: socket.img,
                connected: socket.connected,
            })
        }
    })
})

httpServer.listen(port, () => {console.log('Server Listning')})