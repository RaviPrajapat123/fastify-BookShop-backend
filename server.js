import Fastify from 'fastify'
import cors from '@fastify/cors';
import db from './db.js';
import * as yup from 'yup';
import bcrypt from 'bcrypt';
import jwt from "jsonwebtoken"
import { authenticateToken } from './authenticateToken.js';
import { ObjectId } from 'mongodb';
import dotenv from 'dotenv'
dotenv.config()

// import { json } from 'stream/consumers';
const fastify = Fastify({ logger: true });
fastify.register(cors, {
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS',"PUT"], 
});


await fastify.register(db);

const User = fastify.mongo.db.collection('User');
const Book=fastify.mongo.db.collection("Book")
const orderCollection = fastify.mongo.db.collection('orders');


const yupOptions = {
  strict: false,
  abortEarly: false,
  stripUnknown: true,
  recursive: true,
};




const signUpSchema = yup.object().shape({
  username: yup.string().min(4, 'Username must be at least 4 characters').required('Username is required'),
  email: yup.string().email('Invalid email format').required('Email is required'),
  password: yup.string().min(6, 'Password must be at least 6 characters').required('Password is required'),
  address: yup.string().required('Address is required'),
});

fastify.post('/sign-up', async (request, reply) => {
  try {
    const validatedData = signUpSchema.validateSync(request.body, yupOptions);
    
    const existingUsername = await User.findOne({ username: validatedData.username });
    if (existingUsername) {
      return reply.code(400).send({ error: 'Username already exists' });
    }

    const existingEmail = await User.findOne({ email: validatedData.email });
    if (existingEmail) {
      return reply.code(400).send({ error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(validatedData.password, 10);
    const { avatar,role } = request.body;
    

    const userToInsert = {
      ...validatedData,
      password: hashedPassword,
      avatar: avatar || "https://cdn-icons-png.flaticon.com/128/3177/3177440.png",
      role:"user",
      favourites: [],
      cart: [],
      orders: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await User.insertOne(userToInsert);
    reply.code(201).send({ success: true, data: result });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return reply.code(400).send({
        success: false,
        message: 'Validation failed',
        errors: err.errors,
      });
    }

    console.error(err);
    return reply.code(500).send({
      success: false,
      message: 'Internal Server Error',
    });
  }
});

const signInSchema = yup.object({
  username: yup.string().required('Username is required'),
  password: yup.string().required('Password is required')

});

fastify.post('/sign-in', async (request, reply) => {
  try {
    const { username, password } = request.body;

    const existingUser = await User.findOne({ username });
    if (!existingUser) {
      return reply.code(400).send({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, existingUser.password);
    if (!isMatch) {
      return reply.code(400).send({ error: 'Invalid credentials' });
    }

    // ✅ If match
    const authClaims = {
      name: existingUser.username,
      role: existingUser.role,
    };

    const token = jwt.sign({ authClaims }, "bookstore123", { expiresIn: "30d" });

    return reply.code(200).send({
      success:true,
      id: existingUser._id,
      role: existingUser.role,
      token: token,
    });

  } catch (err) {
    console.error(err);
    return reply.code(500).send({
      success: false,
      message: 'Internal Server Error',
    });
  }
});




fastify.get('/get-user-information', {
  preHandler: authenticateToken
}, async (req, reply) => {
  try {
    // ✅ JWT se user ID nikalna (tumne token sign kiya tha { authClaims })
    const username = req.user.authClaims.name;

    // ✅ Username se user find karo
    const user = await User.findOne({ username },
      {projection:{password:0}}
    );

    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    return reply.code(200).send({
      success: true,
      data: user
    });
  } catch (err) {
    console.error(err);
    return reply.code(500).send({ error: 'Internal server error' });
  }
});

fastify.put('/update-address', {
  preHandler: authenticateToken
}, async (req, reply) => {
  try {
    const username = req.user.authClaims.name;
    const { address } = req.body;

    if (!address) {
      return reply.code(400).send({ error: 'Address is required' });
    }

    const result = await User.updateOne(
      { username }, // filter by username
      {
        $set: {
          address,
          updatedAt: new Date()
        }
      }
    );

    if (result.modifiedCount === 0) {
      return reply.code(404).send({ error: 'User not found or address unchanged' });
    }

    return reply.code(200).send({
      success: true,
      message: 'Address updated successfully'
    });

  } catch (err) {
    console.error(err);
    return reply.code(500).send({ error: 'Internal server error' });
  }
});

const bookSchema = yup.object({
  url: yup.string().url('Invalid URL').required('URL is required'),
  title: yup.string().min(2).max(100).required('Title is required'),
  author: yup.string().min(2).required('Author is required'),
  price: yup.number().min(0).required('Price is required'),
  desc: yup.string().min(10).required('Description is required'),
  language: yup.string().required('Language is required'),
});

fastify.post('/add-book', { preHandler: authenticateToken }, async (req, reply) => {
  try {
    // ✅ ID from headers
    const { id } = req.headers;

    // ✅ Check user role
    const user = await User.findOne({ _id: new ObjectId(id) });
    if (!user || user.role !== 'admin') {
      return reply.code(403).send({ message: 'Only admin can add books' });
    }

    // ✅ Validate book body
    const validatedData = bookSchema.validateSync(req.body, yupOptions);

    // ✅ Save to DB
    const result = await Book.insertOne({
      ...validatedData,
      status: req.body.status || "Order Placed",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return reply.code(200).send({ message: 'Book added successfully', bookId: result.insertedId });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return reply.code(400).send({ message: 'Validation failed', errors: error.errors });
    }
    console.error(error);
    return reply.code(500).send({ message: 'Internal server error' });
  }
});

fastify.put('/update-book', {
  preHandler: authenticateToken
}, async (req, reply) => {
  try {
    const userId = req.headers.id;
    const user = await User.findOne({ _id: new ObjectId(userId) });

    if (!user || user.role !== 'admin') {
      return reply.code(403).send({ message: 'Only admin can update books' });
    }

    const bookId = req.headers.bookid;
    const validatedData = bookSchema.validateSync(req.body, yupOptions);

    const updateResult = await Book.updateOne(
      { _id: new ObjectId(bookId) },
      { $set: validatedData }
    );

    if (updateResult.modifiedCount === 0) {
      return reply.code(404).send({ message: 'Nothing updated' });
    }

    return reply.code(200).send({ success: true, message: 'Book updated successfully' });

  } catch (err) {
    if (err.name === 'ValidationError') {
      return reply.code(400).send({
        success: false,
        message: 'Validation failed',
        errors: err.errors
      });
    }

    console.error(err);
    return reply.code(500).send({ error: 'Internal Server Error' });
  }
});

fastify.delete('/delete-book', {
  preHandler: authenticateToken
}, async (req, reply) => {
  try {
    const userId = req.headers.id;
    const user = await User.findOne({ _id: new ObjectId(userId) });

    if (!user || user.role !== 'admin') {
      return reply.code(403).send({ message: 'Only admin can delete books' });
    }

    const bookId = req.headers.bookid;

    const deleteResult = await Book.deleteOne({ _id: new ObjectId(bookId) });

    if (deleteResult.deletedCount === 0) {
      return reply.code(404).send({ success: false, message: 'Book not found' });
    }

    return reply.code(200).send({ success: true, message: 'Book deleted successfully' });

  } catch (err) {
    console.error(err);
    return reply.code(500).send({ error: 'Internal Server Error' });
  }
});

fastify.get("/get-all-book",async(req,reply)=>{
  try{
      const books=await Book.find().toArray();
       return reply.code(200).send({
      status: 'Success',
      data: books
    });
  }
  catch (error) {
    console.error(error);
    return reply.code(500).send({ message: 'An error occurred' });
  }
})

fastify.get('/get-recent-books', async (req, reply) => {
  try {
    const books = await Book.find().sort({ createdAt: -1 }).limit(4).toArray(); // `.toArray()` is important if using MongoDB native driver

    return reply.code(200).send({
      status: 'Success',
      data: books
    });
  } catch (error) {
    console.error(error);
    return reply.code(500).send({ message: 'An error occurred' });
  }
});

fastify.get('/get-book-by-id/:id', async (req, reply) => {
  try {
    const { id } = req.params;
    console.log("id ka type kya h=",typeof id)

    const book = await Book.findOne({ _id: new ObjectId(id) });

    if (!book) {
      return reply.code(404).send({ message: 'Book not found' });
    }

    return reply.code(200).send({
      status: 'Success',
      data: book
    });

  } catch (error) {
    console.error(error);
    return reply.code(500).send({ message: 'An error occurred' });
  }
});

// const { ObjectId } = require('mongodb');

fastify.put('/add-book-to-favourite', { preHandler: authenticateToken }, async (req, reply) => {
  try {
    const { bookid, id } = req.headers;

    const userData = await User.findOne({ _id: new ObjectId(id) });

    if (!userData) {
      return reply.code(404).send({ message: 'User not found' });
    }

    // ✅ Book already favourite hai kya?
    const isBookFavourite = (userData.favourites || []).includes(bookid);
    if (isBookFavourite) {
      return reply.code(200).send({ message: 'Book is already in favourites' });
    }

    // ✅ Push bookid to favourites array
    await User.updateOne(
      { _id: new ObjectId(id) },
      { $push: { favourites: bookid } }
    );

    return reply.code(200).send({ message: 'Book added to favourites' });

  } catch (error) {
    console.error(error);
    return reply.code(500).send({ message: 'Internal server error' });
  }
});

fastify.put('/remove-book-from-favourite', { preHandler: authenticateToken }, async (req, reply) => {
  try {
    const { bookid, id } = req.headers;

    // ✅ MongoDB users collection
    // const userCollection = fastify.mongo.db.collection('users');

    // ✅ Check if user exists
    const userData = await User.findOne({ _id: new ObjectId(id) });
    if (!userData) {
      return reply.code(404).send({ message: 'User not found' });
    }

    // ✅ Check if book is in favourites
    const isBookFavourite = (userData.favourites || []).includes(bookid);
    if (!isBookFavourite) {
      return reply.code(400).send({ message: 'Book is not in favourites' });
    }

    // ✅ Remove book from favourites array
    await User.updateOne(
      { _id: new ObjectId(id) },
      { $pull: { favourites: bookid } }
    );

    return reply.code(200).send({ message: 'Book removed from favourites' });

  } catch (error) {
    console.error(error);
    return reply.code(500).send({ message: 'Internal server error' });
  }
});



fastify.get("/get-favourite-books", { preHandler: authenticateToken }, async (req, reply) => {
  try {
    const { id } = req.headers;


    // ✅ User find karo
    const user = await User.findOne({ _id: new ObjectId(id) });

    if (!user) {
      return reply.code(404).send({ message: "User not found" });
    }

    const favouriteIds = user.favourites || [];

    if (favouriteIds.length === 0) {
      return reply.code(200).send({ message: "No favourite books", data: [] });
    }

    // ✅ Favourites ke IDs se books fetch karo
    const books = await Book.find({
      _id: { $in: favouriteIds.map(id => new ObjectId(id)) }
    }).toArray();

    return reply.code(200).send({
      message: "Favourite books fetched successfully",
      data: books
    });

  } catch (error) {
    console.error(error);
    return reply.code(500).send({ message: "Internal server error" });
  }
});




fastify.put("/add-to-cart", { preHandler: authenticateToken }, async (req, reply) => {
  try {
    const { bookid, id } = req.headers;

    

    // ✅ User data fetch
    const userData = await User.findOne({ _id: new ObjectId(id) });

    if (!userData) {
      return reply.code(404).send({ message: "User not found" });
    }

    // ✅ Check if book already in cart
    const isBookInCart = userData.cart?.includes(bookid);

    if (isBookInCart) {
      return reply.code(200).send({
        status: "Success",
        message: "Book is already in cart"
      });
    }

    // ✅ Push bookid to cart
    await User.updateOne(
      { _id: new ObjectId(id) },
      { $push: { cart: bookid } }
    );

    return reply.code(200).send({
      status: "Success",
      message: "Book added to cart"
    });

  } catch (error) {
    console.error(error);
    return reply.code(500).send({ message: "An error occurred" });
  }
});



fastify.put('/remove-from-cart/:bookid', {
  preHandler: authenticateToken
}, async (req, reply) => {
  try {
    const { bookid } = req.params;
    const { id } = req.headers;

      const userData = await User.findOne({ _id: new ObjectId(id) });
         if (!userData) {
      return reply.code(404).send({ message: "User not found" });
    }

      const isBookInCart = userData.cart?.includes(bookid);

    if (!isBookInCart) {
      return reply.code(400).send({
        status: "Fail",
        message: "Book is not in the cart"
      });
    }

    // 🧠 Update user: remove bookid from cart
    await User.updateOne(
      { _id: new ObjectId(id) },
      { $pull: { cart: bookid } }
    );

    return reply.code(200).send({
      status: "Success",
      message: "Book removed from cart"
    });

  } catch (error) {
    console.error(error);
    return reply.code(500).send({
      message: "An error occurred"
    });
  }
});


fastify.get('/get-user-cart', {
  preHandler: authenticateToken
}, async (req, reply) => {
  try {
    const { id } = req.headers;

  

    const userData = await User.findOne({ _id: new ObjectId(id) });

    if (!userData) {
      return reply.code(404).send({ message: "User not found" });
    }

    // Manually populate cart with book documents
    const cartBooks = await Book
      .find({ _id: { $in: userData.cart.map(id => new ObjectId(id)) } })
      .toArray();

    // Reverse for latest first
    const cart = cartBooks.reverse();

    return reply.code(200).send({
      status: "Success",
      data: cart
    });

  } catch (error) {
    console.error(error);
    return reply.code(500).send({ message: "An error occurred" });
  }
});

// fastify.post('/place-order', {
//   preHandler: authenticateToken
// }, async (req, reply) => {
//   try {
//     const { id } = req.headers;
//     const { order } = req.body;
  

//     for (const orderData of order) {
//       // New order object
//       const newOrder = {
//         user: new ObjectId(id),
//         book: new ObjectId(orderData._id)
//       };

//       // Insert into order collection
//       const result = await orderCollection.insertOne(newOrder);

//       // Save order ID in user's orders
//       await User.updateOne(
//         { _id: new ObjectId(id) },
//         { $push: { orders: result.insertedId } }
//       );

//       // Remove book from cart
//       await User.updateOne(
//         { _id: new ObjectId(id) },
//         { $pull: { cart: new ObjectId(orderData._id) } }
//       );
//     }

//     return reply.code(200).send({
//       status: "Success",
//       message: "Order Placed Successfully"
//     });

//   } catch (error) {
//     console.error(error);
//     return reply.code(500).send({ message: "An error occurred" });
//   }
// });


fastify.post('/place-order', {
  preHandler: authenticateToken
}, async (req, reply) => {
  try {
    const { id } = req.headers;
    const { order } = req.body;

    for (const orderData of order) {
      // नया order ऑब्जेक्ट बनाओ
      const newOrder = {
        user: new ObjectId(id),
        book: new ObjectId(orderData._id)
      };

      // order collection में insert करो
      const result = await orderCollection.insertOne(newOrder);

      // यूजर के orders में नया order ID जोड़ो
      await User.updateOne(
        { _id: new ObjectId(id) },
        { $push: { orders: result.insertedId } }
      );

      // यूजर के cart से book ID (string के रूप में) remove करो
      await User.updateOne(
        { _id: new ObjectId(id) },
        { $pull: { cart: orderData._id } }  // यहाँ ObjectId नहीं लगाना है
      );
    }

    // ऑर्डर प्लेस होने के बाद updated cart चेक करने के लिए (optional)
    const updatedUser = await User.findOne({ _id: new ObjectId(id) });
    console.log("User Cart after placing order:", updatedUser.cart);

    return reply.code(200).send({
      status: "Success",
      message: "Order Placed Successfully"
    });

  } catch (error) {
    console.error(error);
    return reply.code(500).send({ message: "An error occurred" });
  }
});



fastify.get("/get-order-history", { preValidation: [authenticateToken] }, async (request, reply) => {
  try {
    const { id } = request.headers;

    const userData = await User.findOne({ _id: new fastify.mongo.ObjectId(id) });

    if (!userData || !Array.isArray(userData.orders)) {
      return reply.code(404).send({ message: "User or orders not found" });
    }

   const orders = await Promise.all(
  userData.orders.map(async (orderId) => {
    const order = await orderCollection.findOne({ _id: new fastify.mongo.ObjectId(orderId) });

    if (!order) return null;

    let book = null;
    if (order.book) {
      book = await Book.findOne({ _id: new fastify.mongo.ObjectId(order.book) });
    }

    return {
      book, // can be null
      status: order.status || "Order Placed",
      _id: order._id,
    };
  })
);

// ✅ filter out null orders (where order not found)
const filteredOrders = orders.filter(order => order !== null);

// ✅ Optionally filter out null books also
const safeOrders = filteredOrders.filter(order => order.book !== null);

const reversedOrders = safeOrders.reverse();


    return reply.send({
      status: "Success",
      data: reversedOrders,
    });

  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ message: "An error occurred" });
  }
});




fastify.get("/get-all-orders", async (request, reply) => {
  try {
    const orders = await orderCollection.find().sort({ createdAt: -1 }).toArray();

    const populatedOrders = await Promise.all(
      orders.map(async (order) => {
        // Agar book ya user ki ID missing ho to null return karo
        if (!order.book || !order.user) return null;

        const book = await Book.findOne({
          _id: new fastify.mongo.ObjectId(order.book)
        });

        const user = await User.findOne({
          _id: new fastify.mongo.ObjectId(order.user)
        });

        // Agar book ya user DB me milta nahi hai to null return karo
        if (!book || !user) return null;

        return {
          ...order,
          book,
          user,
        };
      })
    );

    // Null orders ko hatao
    const filteredOrders = populatedOrders.filter(order => order !== null);

    return reply.send({
      status: "Success",
      data: filteredOrders
    });

  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({
      message: "An error occurred",
      error: error.message
    });
  }
});



fastify.put('/update-status/:id', { 
  preValidation: [authenticateToken]
}, async (request, reply) => {
  try {
    const { id } = request.params;
    const { status } = request.body;
    
    // Validate status
    const validStatuses = ["Order Placed", "Out for delivery", "Delivered", "Canceled"];
    if (!validStatuses.includes(status)) {
      return reply.code(400).send({ 
        success: false,
        message: "Invalid status value"
      });
    }

    // Update order status
    const result = await orderCollection
      .updateOne(
        { _id: new ObjectId(id) }, // Using imported ObjectId
        { $set: { status } }
      );

    // Check if order was found
    if (result.matchedCount === 0) {
      return reply.code(404).send({
        success: false,
        message: "Order not found"
      });
    }

    // Return success response
    return reply.send({
      success: true,
      message: `Order status updated successfully`,
      updatedStatus: status,
      orderId: id
    });

  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
});


fastify.listen({ port: 3000 }, (err, addr) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`Server run at ${addr}`);
});






