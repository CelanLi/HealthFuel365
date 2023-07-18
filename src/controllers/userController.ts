import { Request, Response } from "express";

import bcrypt, { compareSync } from "bcrypt";
import jwt from "jsonwebtoken";
import { internalServerErrorMessage, JwtSecret } from "../config";

import Userschema from "../models/user";
import ProfileSchema from "../models/profile";
import AddressSchema from "../models/address";
import ShoppingCartSchema from "../models/shoppingcart";

import { loginUser,findAddressByUser } from "../services/userService";
import { findOrderByUser, findOrderById, findServicesByOrderId, findPaymentByOrderId, findPromododeByCode } from "../services/orderService";

import user from "../models/user";
import { ConnectionClosedEvent, MongoUnexpectedServerResponseError } from "mongodb";
import order, { OrderSchema } from "../models/order";
import promocode from "../models/promocode";
import { generateRecommendationList } from "../services/recommendationService";

export async function register(req: Request, res: Response) {
  console.log("11111")
  const newUser = new Userschema(req.body);
  console.log(newUser);

  if (!newUser) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Invalid User object",
    });
  } else if (!newUser.password) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Invalid password",
    });
  }
  try {
    //search for user with given username
    const existingUser = await Userschema.findOne({
      username: newUser.username,
    });
    if (existingUser) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Username already exists",
      });
    }

    //check email format
    const emailFormat = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,}$/;
    if (!emailFormat.test(newUser.email)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Invalid email format.",
      });
    }

    //password hashing
    const salt = bcrypt.genSaltSync(10); //rather than directly store the password in the database, salt value is used to encrypt the password
    const hashedPassword = bcrypt.hashSync(newUser.password, salt);
    newUser.password = hashedPassword;
    //save new user into database
    let user = await newUser.save();
    console.log(user._id)
    
    // create a default profile
    ProfileSchema.create({
      userID: user._id,
      // name: undefined,
      // goal: undefined,
      typeOfEater: "Omnivore",
      // dietaryPreferences: undefined,
      losingWeightAsGoal: false,
      keepGoodDietAsGoal:false,
      lowInFat: false,
      lowInSugar: false,
      lowInSalt: false,
      nutriPreference: ['A','B','C','D','E']
    });

    // create an empty shoppingcart, where shopping cart id is the same with user id
    // ShoppingCartSchema.create({
    //     shoppingCartID: user._id,
    //     itemPrice: 0,
    //     totalSaving: 0,
    //     subTotal: 0,
    //     itemQuantity: 0,
    //     codeValue: ""
    // });

  const shoppingCartTest = new ShoppingCartSchema({
    shoppingCartID: user._id,
    itemPrice: 0,
    totalSaving: 0,
    subTotal: 0,
    itemQuantity: 0,
    codeValue: ""
  });
  
  console.log("run")
  shoppingCartTest.validate()
  .catch((error) => {
    // if the validation fails
    const validationErrors = [];
    for (let key in error.errors) {
      if (error.errors.hasOwnProperty(key)) {
        const errorMessage = error.errors[key].message;
        validationErrors.push(errorMessage);
      }
      console.log(error)
    }
    console.error('Validation failed:', validationErrors);
  })
  .then(() => {
    console.log("passed")
    // validation passed, save
    shoppingCartTest.save()
      .then((savedShoppingCart) => {
        console.log('ShoppingCart saved:', savedShoppingCart);
      })
      .catch((error) => {
        console.error('Save failed:', error);
      });
  });
  console.log("end")


    // const token = jwt.sign(
    //   { id: user._id, username: user.username },
    //   JwtSecret,
    //   {
    //     expiresIn: 86400, // expires in 24 hours
    //   }
    // );

    // console.log(token)

    // return res
    //   .status(200)
    //   .json({ token: token, message: "User was created successfully" });

    const expirationTime = 86400; // expires in 24 hours
    // create a token
    const token = jwt.sign(
      { id: user.id, username: user.username },
      JwtSecret,
      {
        expiresIn: expirationTime, // expires in 24 hours
      }
    );

    console.log(token)

    return res.status(200).json({
      token: token,
      expiresIn: expirationTime,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json(internalServerErrorMessage);
  }
}

export async function login(req: Request, res: Response) {
  const { username, password } = req.body;

  console.log("body",req.body)
  if (!username || !password) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Missing param: " + (username ? "password" : "username"),
    });
  }
  try {
    //find user
    const user = await Userschema.findOne({ username });
    if (!user) {
      return res.status(404).json({
        error: "Not Found",
        message: "User not found",
      });
    }
    //check correct password
    const correctPassword = compareSync(password, user.password);
    if (!correctPassword) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Wrong password",
      });
    }
    const expirationTime = 86400; // expires in 24 hours
    // create a token
    const token = jwt.sign(
      { id: user.id, username: user.username },
      JwtSecret,
      {
        expiresIn: expirationTime, // expires in 24 hours
      }
    );

    console.log(token)

    return res.status(200).json({
      token: token,
      expiresIn: expirationTime,
    });
  } catch (error) {
    return res.status(500).json(internalServerErrorMessage);
  }
}

export async function getUser(req: Request, res: Response) {
  console.log("getuser!")
  try {
    //@ts-ignore
    const userID = req.userId;
    Userschema.findById(userID)
    .exec()
    .then((user) => {
      if (!user) {
        return res.status(404).json({
          error: "Not Found",
          message: "User not found",
        });
      }
      //send out modified userobject, since we do not want to send out the password
      const requestedUser = {
        username: user.username,
        id: user._id,
        avatar: user.avatar ? user.avatar : null
      };
      return res.status(200).json(requestedUser);
    })
    .catch((error) => res.status(500).json(internalServerErrorMessage));
  } catch (error) {
    
  }
}

export async function avatarEdit(req: Request, res: Response) {
  console.log("avatarEdit")
  const avatar = req.body.avatar;
  try {
    //@ts-ignore
    const userID = req.userId; //current user's id
    console.log("userId",userID)
    const existingUser = await Userschema.findOne({
      _id: userID,
    });
    console.log("existingUser" ,existingUser)

    if (!userID || !existingUser) {
      return res.status(400).json({
        error: "Bad Request",
        message: "User doesn't exist!",
      });
    }

    const userResponse = Userschema.findOneAndUpdate(
      { _id: existingUser._id },
      { $set: { avatar: avatar } },
      { new: true }
    );
    userResponse
      .then((updatedAvatar) => {
        // If updated, then save
        if(updatedAvatar){
          updatedAvatar.save()
          .then((savedAvatar) => {
            console.log('Avatar saved:', savedAvatar);
          })
          .catch((error) => {
            console.error('Error saving profile:', error);
          });
        }
      })
      .catch((error) => {
        console.error('Error updating profile:', error);
      });

    await existingUser.save(); // save the updated user
    return res.status(200).json({
      message: "Avatar updated successfully",
    });
  } catch (error) {
    // console.log(error)
    return res.status(500).json(internalServerErrorMessage);
  }
}

export async function profileEdit(req: Request, res: Response) {
  
  const profile = req.body;
  try {
    //@ts-ignore
    const userID = req.userId; //current user's id
    // const userID = "64872a4ed2c673dd7bba2b39";
    console.log("afdlka",userID)
    const existingUser = await Userschema.findOne({
      _id: userID,
    });
    console.log("aaa",existingUser)

    if (!userID || !existingUser) {
      return res.status(400).json({
        error: "Bad Request",
        message: "User doesn't exist!",
      });
    }

    const profileToBeEdit = await ProfileSchema.findOne({
      userID: userID,
    });
    console.log("dafjlaj",profileToBeEdit)

    if (!profileToBeEdit) {
      return res.status(404).json({
        error: "Not Found",
        message: `Profile with ID:${userID} not found!`,
      });
    }

    const profileResponse = ProfileSchema.findOneAndUpdate({ _id: profileToBeEdit._id }, profile, { new: true });
    profileResponse
      .then((updatedProfile) => {
        // If updated, then save
        if(updatedProfile){
          updatedProfile.save()
          .then((savedProfile) => {
            console.log('Profile saved:', savedProfile);
          })
          .catch((error) => {
            console.error('Error saving profile:', error);
          });
        }
      })
      .catch((error) => {
        console.error('Error updating profile:', error);
      });

      //update recommendation list
      generateRecommendationList(userID)
    return res.status(200).json({
      message: "Profile updated successfully",
    });
  } catch (error) {
    return res.status(500).json(internalServerErrorMessage);
  }
}

export async function profileGet(req: Request, res: Response) {
  try {
    //@ts-ignore
    const userID = req.userId; //current user's id
    const existingUser = await Userschema.findOne({
      _id: userID,
    });

    if (!userID || !existingUser) {
      return res.status(400).json({
        error: "Bad Request",
        message: "User doesn't exist!",
      });
    }

    const profileGet = await ProfileSchema.findOne({
      userID: userID,
    });
    console.log("dafjlaj",profileGet)

    if (!profileGet) {
      return res.status(404).json({
        error: "Not Found",
        message: `Profile with ID:${userID} not found!`,
      });
    }

    return res.status(200).send(profileGet);
  } catch (error) {
    return res.status(500).json(internalServerErrorMessage);
  }
}

export async function addressAdd(req: Request, res: Response) {
  const newAddress = new AddressSchema(req.body)
  console.log("addressAdd",newAddress)

  try {
    //@ts-ignore
    const userID = req.userId; //current user's id
    // const userID = "64872a4ed2c673dd7bba2b39";
    console.log("afdlka",userID)
    const existingUser = await Userschema.findOne({
      _id: userID,
    });
    console.log("aaa",existingUser)

    if (!userID || !existingUser) {
      return res.status(400).json({
        error: "Bad Request",
        message: "User doesn't exist!",
      });
    }

    newAddress.user = userID;

    let address = await newAddress.save();
    console.log("dafa",address)

    return res.status(200).json({
      message: "Address added successfully",
    });
  } catch (error) {
    console.error(error)
    return res.status(500).json(internalServerErrorMessage);
  }
}

export async function addressGet(req: Request, res: Response) {
  try {
    //@ts-ignore
    const userID = req.userId; //current user's id
    const existingUser = await Userschema.findOne({
      _id: userID,
    });

    if (!userID || !existingUser) {
      return res.status(400).json({
        error: "Bad Request",
        message: "User doesn't exist!",
      });
    }

    const address = await findAddressByUser(userID);
    return res.status(200).send(address);
  } catch (error) {
    return res.status(500).json(internalServerErrorMessage);
  }
}

export async function addressDelete(req: Request, res: Response) {
  console.log("addressDelete1")
  try {
    console.log("addressDelete2")
    //@ts-ignore
    const addressID = req.query.addressID; //current address's id
    console.log(addressID)

    if (!addressID) {
      return res.status(400).json({
        error: "Bad Request",
        message: "No id defined",
      });
    }
    let addressToBeDeleted = await AddressSchema.findById({ _id: addressID });
    if (!addressToBeDeleted) {
      return res.status(404).json({
        error: "Not Found",
        message: `Address with ID:${addressID} not found!`,
      });
    }

    await AddressSchema.findByIdAndDelete(addressID);

    return res.status(200).json({
      message: "Address deleted successfully",
    });
  } catch (error) {
    return res.status(500).json(internalServerErrorMessage);
  }
}

export async function addressEdit(req: Request, res: Response) {
  try {
    const address = req.body;
    const addressID = req.query.addressID;
    console.log("edit",address)

    if (!addressID) {
      return res.status(400).json({
        error: "Bad Request",
        message: "No id defined",
      });
    }
    let addressToBeEdit = await AddressSchema.findById({ _id: addressID });
    if (!addressToBeEdit) {
      return res.status(404).json({
        error: "Not Found",
        message: `Address with ID:${addressID} not found!`,
      });
    }
    console.log("dafjlaj",addressToBeEdit)

    const addressResponse = AddressSchema.findOneAndUpdate({ _id: addressToBeEdit._id }, address, { new: true });
    addressResponse
      .then((updatedAddress) => {
        // If updated, then save
        if(updatedAddress){
          updatedAddress.save()
          .then((savedAddress) => {
            console.log('Address saved:', savedAddress);
          })
          .catch((error) => {
            console.error('Error saving Address:', error);
          });
        }
      })
      .catch((error) => {
        console.error('Error updating Address:', error);
      });
    console.log("dafa",addressResponse)
    return res.status(200).json({
      message: "Address updated successfully",
    });
  } catch (error) {
    return res.status(500).json(internalServerErrorMessage);
  }
}
/*
export async function deleteUser(req: Request, res: Response) {
  const { id } = req.params; //the requested id
  try {
    //@ts-ignore
    const userID = req.userId; //current user's id
    if (!id) {
      return res.status(400).json({
        error: "Bad Request",
        message: "No id defined",
      });
    }
    let userToBeDeleted = await Userschema.findById({ _id: id });
    if (!userToBeDeleted) {
      return res.status(404).json({
        error: "Not Found",
        message: `User with ID:${id} not found!`,
      });
    }
    if (id !== userID) {
      return res.status(403).json({
        error: "Forbidden",
        message: `You do not have the rights to delete the user with ID:${id}`,
      });
    }

    await Userschema.findByIdAndDelete(id);
    await ProfileSchema.findOneAndDelete({ userID: id });
    return res.status(200).json({
      message: "User deleted successfully",
    });
  } catch (error) {
    return res.status(500).json(internalServerErrorMessage);
  }
}
*/

export async function getOrder(req: Request, res: Response) {
  console.log("getOrder")
  try {
    console.log("getOrder")
    //@ts-ignore
    const userID = req.userId; //current user's id
    console.log(userID)
    const existingUser = await Userschema.findOne({
      _id: userID,
    });

    if (!userID || !existingUser) {
      return res.status(400).json({
        error: "Bad Request",
        message: "User doesn't exist!",
      });
    }

    const order = await findOrderByUser(userID);
    return res.status(200).send(order);
  } catch (error) {
    return res.status(500).json(internalServerErrorMessage);
  }
}

export async function getOrderById(req: Request, res: Response) {
  console.log("getOrderById!")
  try {
    //@ts-ignore
    const stringID = req.query.orderID as string;
    const orderID = stringID.substring(8)
    console.log("getOrderById!11",orderID)
    let order = await findOrderById(orderID);
    if (!order) {
      return res.status(404).json({
        error: "Not Found",
        message: `Order with ID:${orderID} not found!`,
      });
    }
      return res.status(200).json(order);
    }catch (error) {
    return res.status(500).json(internalServerErrorMessage);
  }
}

export async function getServicesByOrderId(req: Request, res: Response) {
  console.log("getServicesByOrderId!")
  try {
    //@ts-ignore
    const stringID = req.query.orderID as string;
    const orderID = stringID;
    console.log(orderID);
    let services = await findServicesByOrderId(orderID);
    if (!services) {
      return res.status(404).json({
        error: "Not Found",
        message: `Order with ID:${orderID} not found!`,
      });
    }
    console.log(services);
    return res.status(200).json(services);
    }catch (error) {
    return res.status(500).json(internalServerErrorMessage);
  }
}

export async function getPaymentByOrderId(req: Request, res: Response) {
  console.log("getPaymentByOrderId!")
  try {
    //@ts-ignore
    const stringID = req.query.orderID as string;
    const orderID = stringID.substring(8);
    console.log("getPaymentByOrderId!111",orderID);
    let payment = await findPaymentByOrderId(orderID);
    if (!payment) {
      return res.status(200).json({
        message: `Payment with order ID: ${orderID} not found!`,
        payment: null,
      });
    }
    console.log(payment);
    return res.status(200).json({payment:payment});
    }catch (error) {
    return res.status(500).json(internalServerErrorMessage);
  }
}

export async function getPromocodeByOrderId(req: Request, res: Response) {
  console.log("getPromocodeByOrderId!")
  try {
    //@ts-ignore
    const stringID = req.query.orderID as string;
    const orderID = stringID.substring(8);
    let order = await findOrderById(orderID);
    if (order && order.codeValue) {
      let promocode = await findPromododeByCode(order.codeValue);
      if (!promocode) {
        return res.status(200).json({promocode: null});
      }
      else{
        return res.status(200).json({promocode:promocode});
      }      
    }
    else{
      return res.status(200).json({promocode: null});
    }
    }catch (error) {
    return res.status(500).json(internalServerErrorMessage);
  }
}