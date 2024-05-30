import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import {User} from "../models/user.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import mongoose from 'mongoose'

const generateAccessandRefreshTokens = async(userId) => {
          try {
            const user=await User.findById(userId)
            const refreshToken=user.generateRefreshToken();
            const accessToken=user.generateAccessToken();

            user.refreshToken=refreshToken
            await user.save({validateBeforeSave:false})

            return {accessToken,refreshToken}

          } catch (error) {
            throw new ApiError(500,"Something went wrong while generating refresh and acces tokens")
          }
}

const registerUser=asyncHandler(async(req,res)=> {
   

const {fullName,email,username,password}=req.body
//console.log("email:",email)

if (
    [fullName, email, username, password].some((field) => field?.trim() === "")
) {
    throw new ApiError(400, "All fields are required")
}

const existedUser=await User.findOne({
    $or : [{username},{email}]
})

if(existedUser) {
    throw new ApiError(409,"User with email or username already exists")
}

const avatarLocalPath=req.files?.avatar[0]?.path;
const coverImageLocalPath=req.files?.coverImage[0]?.path;

//letcoverImageLocalPath
//if(req.files &&  Array.isArray(req.files.coverImage)&& req.files.coverImage.length>0) {
    //coverImageLocalPath=req.files.coverImage[0].path;


if(!avatarLocalPath) {
    throw new ApiError(400,"Avatar file is required")
}

const avatar=await uploadOnCloudinary(avatarLocalPath)
const coverImage=await uploadOnCloudinary(coverImageLocalPath)

if(!avatar) {
    throw new ApiError(400,"Avatar file is required")
}

const user = await User.create({
    fullName,
    avatar:avatar.url,
    coverImage:coverImage?.url || "",
    email,
    password,
    username:username.toLowerCase()

})
const createdUser=await User.findById(user._id).select(
    "-password -refreshToken"
)

if(!createdUser) {
    throw new ApiError(500,"Something went wrong while registering the user")
}

return res.status(201).json(
    new ApiResponse(200, createdUser, "User registered Successfully")
)
})

const loginUser=asyncHandler(async(req,res)=> {
       const {email,username,password}=req.body;

       if(!username && !email) {
        throw new ApiError(400,"Username or email is required")
       }

       const user = await User.findOne(
        {
            $or : [{username},{email}]
        }
       )

       if(!user) {
        throw new ApiError(404,"User does not exist")
       }

       const isPasswordValid=await user.isPasswordCorrect(password)

       if(!isPasswordValid) {
        throw new ApiError(404,"Passsword does not exist")
       }
      
       const {accessToken,refreshToken} = await generateAccessandRefreshTokens(user._id) 

       const loggedInUser=await User.findById(user._id).
       select("-password -refreshToken")

       const options = {
        httpOnly : true,
        secure:true
       }
       return res
       .status(200)
       .cookie("accessToken",accessToken,options)
       .cookie("refreshToken",refreshToken,options)
       .json(
        new ApiResponse(
            200,
            {
                user : loggedInUser,accessToken,refreshToken
            },
            "User logged in sucessfully"
        )
       )

})

const logoutUser=asyncHandler(async(req,res)=> {
  await User.findByIdAndUpdate(
    req.user._id,
    {
        $unset : {
            refreshToken:1
        }
    },
    {
        new:true
    }
  )
  const options = {
    httpOnly : true,
    secure:true
   }
   return res
   .status(200)
   .clearCookie("accessToken",options)
   .clearCookie("refreshToken",options)
   .json(new ApiResponse(200,{},"User logged out"))

})

const refreshAccessToken=asyncHandler(async(req,res)=> {
    const incomingRefreshToken=req.cookies.refreshToken || req.body.refreshToken

    if(!incomingRefreshToken) {
        throw new ApiError(401,"Unauthorized request")
    }
    try {
        const decodedToken=jwt.verify(incomingRefreshToken,process.env.REFRESH_TOKEN_SECRET)
    
        const user = await User.findById(decodeToken?._id)
    
        if(!user) {
            throw new ApiError(401,"Invalid access token")
        }
        if(incomingRefreshToken!==user?.refreshToken) {
            throw new ApiError(401,"Refresh token is expired or used")
        }
        const options = {
            httpOnly:true,
            secure:true
        }
       await generateAccessandRefreshTokens(user._id)
       return res
       .status(200)
       .cookie("accessToken",accessToken,options)
       .cookie("refreshToken",newRefreshToken,options)
       .json(
        new ApiResponse(
            200,
            {accessToken,refreshToken:newRefreshToken},
            "Access token refreshed"
        )
       )
    } catch (error) {
        throw new ApiError(401,error?.message || "Invalid Refresh Token")
    }
})

const changeCurrentPassword = asyncHandler(async(req,res)=> {
    const {oldPassword,newPassword}=req.body

    const user = await User.findById(req.user?._id)
    const isPasswordCorrect=await user.isPasswordCorrect(oldPassword)

    if(!isPasswordCorrect) {
        throw new ApiError(400,"Invalid old password")
    }
    user.password=newPassword
   await user.save({validateBeforeSave:false})
    
    return res
    .status(200)
    .json(new ApiResponse(200,{},"Password Changed Succesfully"))
})

const getCurrentUser = asyncHandler(async(req,res)=> {
    return res
    .status(200)
    .json(200,req.user,"Current user fetched succesfully")

})

const updateAccountDetails=asyncHandler(async(req,res)=> {
    const {fullName,email}=req.body

    if(!fullName || !email) {
        throw new ApiError(400,"All fields are required")
    }
    const user = User.findByIdAndUpdate(
        req.user?._id,
        {
            fullName,
            email:email
        },
        {new:true}
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200,user,"Account details updated succesfully"))

})

const updateUserAvatar = asyncHandler(async(req, res) => {
    const avatarLocalPath = req.file?.path

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is missing")
    }
     

    //TODO - DELETE OLD IMAGE

    const avatar = await uploadOnCloudinary(avatarLocalPath)

    if (!avatar.url) {
        throw new ApiError(400, "Error while uploading on avatar")
        
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                avatar: avatar.url
            }
        },
        {new: true}
    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(200, user, "Avatar image updated successfully")
    )
})

const updateUserCoverImage = asyncHandler(async(req, res) => {
    const coverImageLocalPath = req.file?.path

    if (!coverImageLocalPath) {
        throw new ApiError(400, "Cover image file is missing")
    }

    //TODO: delete old image - assignment


    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if (!coverImage.url) {
        throw new ApiError(400, "Error while uploading on avatar")
        
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                coverImage: coverImage.url
            }
        },
        {new: true}
    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(200, user, "Cover image updated successfully")
    )
})

const getUserChannelProfile = asyncHandler(async(req,res)=> {
    const {username}=req.params

    if(!username?.trim()) {
        throw new ApiError(400,"Username is missing")
    }
    const channel = await User.aggregate([
        {
            $match : {
                username:username?.toLowerCase()
            },
            $lookup : {
                from : "subscriptions",
                localField:"_id",
                foreignField:"channel",
                as:"subscribers"
            }
        },
        {
            $lookup:{
                from : "subscriptions",
                localField:"_id",
                foreignField:"subscriber",
                as:"subscribedTo"
            }
        },
        {
            $addFields:{
                subscribersCount : {
                    $size : "$subscribers"
                },
                channelsSubscribedToCount : {
                    $size : "$subscribedTo"
                },
                isSubscribed : {
                    $cond : {
                        if : {$in:[req.user?._id,"subscribers.subscribedTo"]},
                        then:true,
                        else:false
                    }
                }
            }
        },
        {
            $project : {
                fullName : 1,
                username : 1,
                subscribersCount:1,
                channelsSubscribedToCount:1,
                isSubscribed:1,
                coverImage:1,
                email:1
            }
        }
    ])

    if(!channel?.length) {
        throw new  ApiError(404,"channel does not exist")
    }
     
    return res
    .status(200)
    .json(
        new ApiResponse(200,channel[0],"User channel fetched succesfully")
    )
})

const getWatchHistory= asyncHandler(async(req,res)=> {
    const user = await User.aggregate([
        {
            $match:{
                _id:new Mongoose.Types.ObjectId(req.user.id)

            }
        },
        {
            $lookup:{
                from:"videos",
                localField:"watchHistory",
                foreignField:"_id",
                as:"watchHistory",
                pipeline:[
                    {
                        $lookup : {
                            from:"users",
                            localField:"owner",
                            foreignField:"id",
                            as:"owner",
                            pipeline:[
                                {
                                    $project:{
                                        fullName:1,
                                        username:1,
                                        avatar:1
                                 }
                             },

                        ]
                    }
                }
            ]}
        },
        {
            $addFields:{
                owner:{
                    $first:"owner",
                }
            } 
        }
    ])
    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            user[0].watchHistory,
            "Watch history fetched succesfully"
        )
    )

})



export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory
}
