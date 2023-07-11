const express = require('express');
const userRouter = require('./routes/user.routes');
const objectRouter = require('./routes/object.routes');
const objectImageRouter = require('./routes/object_image.routes');
const utilsRouter = require('./routes/utils.routes');
const path = require('path');
const cors = require('cors');
var cookieParser = require('cookie-parser');
const PORT = process.env.PORT || 8080;

const app = express();
app.use(cors({
    origin: [
        "http://HomeCity:3000",
        "http://HomeCity:8080",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8080",
        "http://127.0.0.1:8080"
    ],
    credentials: true
}));
app.use(cookieParser());
app.use(express.json());
app.use('/api', userRouter);
app.use('/api', objectRouter);
app.use('/api', objectImageRouter);
app.use('/api', utilsRouter);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'static')));
app.use(express.static(path.join(__dirname, '../HomeCity/build')));

app.listen(PORT, () => console.log(`server started on port ${PORT}`));