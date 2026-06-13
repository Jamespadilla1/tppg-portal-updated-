# TPPG Portal

Real Estate Management Portal with Admin and Agent dashboards.

---

## 📁 Folder Structure

```
tppg-portal/
├── public/                  ← Your HTML files (frontend)
│   ├── index.html
│   ├── admin-dashboard.html
│   ├── agent-dashboard.html
│   ├── images/              ← Put HOUSE.jpg and TPPG.jpg here
│   └── uploads/             ← ID photo uploads go here
│
├── config/
│   └── db.js                ← MongoDB connection
│
├── models/
│   ├── Admin.js
│   ├── Agent.js
│   ├── Property.js
│   ├── Seller.js
│   ├── Buyer.js
│   └── Log.js
│
├── controllers/
│   ├── authController.js
│   ├── agentController.js
│   ├── propertyController.js
│   ├── sellerController.js
│   └── buyerController.js
│
├── routes/
│   ├── auth.js
│   ├── agents.js
│   ├── properties.js
│   ├── sellers.js
│   ├── buyers.js
│   └── logs.js
│
├── middleware/
│   └── auth.js              ← JWT protect, adminOnly, agentOnly
│
├── server.js                ← Entry point
├── .env                     ← Environment variables
├── .gitignore
└── package.json
```

---

## 🚀 Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure `.env`
```
PORT=3000
MONGO_URI=mongodb://localhost:27017/tppg_portal
JWT_SECRET=tppg_secret_key_change_this
ADMIN_ID=ADMIN-001
ADMIN_EMAIL=admin@tppg.com
ADMIN_PASSWORD=admin123
```

### 3. Create uploads folder
```bash
mkdir public/uploads
```

### 4. Run the server
```bash
# Development (auto-restart)
npm run dev

# Production
npm start
```

### 5. Open in browser
```
http://localhost:3000
```

---

## 🔐 Default Admin Credentials
| Field    | Value           |
|----------|-----------------|
| Admin ID | `ADMIN-001`     |
| Email    | `admin@tppg.com`|
| Password | `admin123`      |

---

## 📡 API Endpoints

| Method | Route                      | Access       | Description           |
|--------|----------------------------|--------------|-----------------------|
| POST   | /api/auth/login            | Public       | Login (admin/agent)   |
| POST   | /api/auth/register         | Public       | Agent application     |
| GET    | /api/agents                | Admin only   | Get all agents        |
| PATCH  | /api/agents/:id/status     | Admin only   | Approve/reject/suspend|
| DELETE | /api/agents/:id            | Admin only   | Delete agent          |
| GET    | /api/properties            | Admin+Agent  | Get all properties    |
| POST   | /api/properties            | Admin only   | Add property          |
| PUT    | /api/properties/:id        | Admin only   | Update property       |
| DELETE | /api/properties/:id        | Admin only   | Delete property       |
| GET    | /api/sellers               | Admin only   | Get all sellers       |
| POST   | /api/sellers               | Admin only   | Add seller            |
| PUT    | /api/sellers/:id           | Admin only   | Update seller         |
| DELETE | /api/sellers/:id           | Admin only   | Delete seller         |
| GET    | /api/buyers                | Admin only   | Get all buyers        |
| POST   | /api/buyers                | Admin only   | Add buyer             |
| PUT    | /api/buyers/:id            | Admin only   | Update buyer          |
| DELETE | /api/buyers/:id            | Admin only   | Delete buyer          |
| GET    | /api/logs                  | Admin only   | Get activity logs     |
| POST   | /api/logs                  | Authenticated| Add a log entry       |
| DELETE | /api/logs                  | Admin only   | Clear all logs        |

---

## 🛠 Tech Stack
- **Frontend**: HTML, Tailwind CSS, Vanilla JS
- **Backend**: Node.js, Express.js
- **Database**: MongoDB + Mongoose
- **Auth**: JWT (jsonwebtoken) + bcryptjs
- **File Upload**: Multer
