const mongoose = require('mongoose');
const dotenv = require('dotenv');
const dns = require('dns')

dotenv.config();

//  system to force use google dn for connection establishmnet
dns.setServers(["8.8.8.8", "8.8.4.4"]);

// MongoDB connecton establishment
const connectDB = async()=>{
    try{
        await mongoose.connect(process.env.MONGO_URI); // MongoDB connection string from env file
        console.log('MongoDB Connected Sucessfully');
    } catch (error){
        console.error('MongoDb Connection Failed :', error.message || error);
        process.exit(1);
    }
};

module.exports = connectDB