// // authenticateToken.js
// import jwt from 'jsonwebtoken';

// export async function authenticateToken(request, reply) {
//   try {
//     const authHeader = request.headers['authorization'];
//     const token = authHeader && authHeader.split(" ")[1];

//     if (!token) {
//       return reply.status(401).send({ message: 'Authentication token required' });
//     }

//     jwt.verify(token, "bookstore123", (err, user) => {
//       if (err) {
//         return reply.status(403).send({ message: 'Token expired. Please sign in again' });
//       }

//       request.user = user; // token ke user ko store kar liya
//     });
//   } catch (err) {
//     return reply.status(500).send({ message: 'Token verification failed' });
//   }
// }


import jwt from 'jsonwebtoken';

export async function authenticateToken(request, reply) {
  try {
    const authHeader = request.headers['authorization'];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return reply.status(401).send({ message: 'Authentication token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => { // यहां बदलाव किया
      if (err) {
        return reply.status(403).send({ message: 'Token expired. Please sign in again' });
      }

      request.user = user;
    });
  } catch (err) {
    return reply.status(500).send({ message: 'Token verification failed' });
  }
}