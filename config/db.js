const mongoose = require('mongoose');
const dontenv = require('dotenv');

dontenv.config();

// MongoDB connecton establishment
const connectDB = async()=>{
    try{
        await mongoose.connect(process.env.MONGO_URI); // MongoDB connection string from env file
        console.log('MongoDB Connected Sucessfully');
    } catch (error){
        console.error('MongoDb Connection Failed :', error.moessage || error);
        process.exit(1);
    }
};

module.exports = connectDB