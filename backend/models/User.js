const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema(
{
    fullName: {
        type: String,
        required: [true, 'Full name is required'],
        trim: true,
        minlength: [3, 'Full name must be at least 3 characters'],
        maxlength: [100, 'Full name cannot exceed 100 characters']
    },

    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        index: true,
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
    },

    phone: {
        type: String,
        trim: true,
        maxlength: 20,
        default: ''
    },

    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [8, 'Password must be at least 8 characters'],
        select: false
    },

    role: {
        type: String,
        enum: [
            'customer',
            'support',
            'inventory',
            'manager',
            'admin',
            'super_admin'
        ],
        default: 'customer'
    },

    avatar: {
        type: String,
        default: ''
    },

    addresses: [
        {
            fullName: String,
            phone: String,
            address: String,
            city: String,
            state: String,
            postalCode: String,
            country: {
                type: String,
                default: 'Pakistan'
            },
            isDefault: {
                type: Boolean,
                default: false
            }
        }
    ],

    isVerified: {
        type: Boolean,
        default: true
    },

    isBlocked: {
        type: Boolean,
        default: false
    },

    isDeleted: {
        type: Boolean,
        default: false
    },

    verificationToken: String,

    resetPasswordToken: String,

    resetPasswordExpire: Date,

    refreshToken: {
        type: String,
        default: null
    },

    lastLogin: Date
},
{
    timestamps: true
});





/*
|--------------------------------------------------------------------------
| Hash Password
|--------------------------------------------------------------------------
*/

userSchema.pre('save', async function(next){

    if(!this.isModified('password')){
        return next();
    }

    try{

        const salt=await bcrypt.genSalt(12);

        this.password=await bcrypt.hash(this.password,salt);

        next();

    }catch(err){

        next(err);

    }

});





/*
|--------------------------------------------------------------------------
| Compare Password
|--------------------------------------------------------------------------
*/

userSchema.methods.matchPassword=async function(password){

    return await bcrypt.compare(password,this.password);

};





/*
|--------------------------------------------------------------------------
| Generate JWT
|--------------------------------------------------------------------------
*/

userSchema.methods.generateToken=function(){

    return jwt.sign(

        {

            id:this._id,

            role:this.role

        },

        process.env.JWT_SECRET,

        {

            expiresIn:process.env.JWT_EXPIRE || '7d'

        }

    );

};





/*
|--------------------------------------------------------------------------
| Hide Sensitive Data
|--------------------------------------------------------------------------
*/

userSchema.methods.toJSON=function(){

    const obj=this.toObject();

    delete obj.password;
    delete obj.resetPasswordToken;
    delete obj.resetPasswordExpire;
    delete obj.refreshToken;
    delete obj.__v;

    return obj;

};

module.exports=mongoose.model('User',userSchema);