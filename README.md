# My Node.js + Angular + MySQL App (Azure-ready)

This is a Node.js/Express backend that serves an Angular SPA and provides a REST API for user and film management, using MySQL (with Sequelize ORM). It is ready for deployment to Azure App Service and supports secure MySQL connections.

## Project Structure

```
my-node-app
├── src
│   └── app.js        # Entry point of the application (Express backend)
├── my-angular-app    # Angular frontend project
│   └── ...
├── dist/my-angular-app/browser # Angular build output (served statically by Express)
├── models            # Sequelize models
├── config            # Sequelize config
├── migrations        # Sequelize migrations
├── seeders           # Sequelize seeders
├── package.json      # npm configuration file
├── web.config        # Azure App Service/IIS config
├── .env              # Environment variables
├── DigiCertGlobalRootCA.crt.pem # MySQL SSL cert
└── README.md         # Project documentation
```

## Prerequisites

- Node.js (v18+ recommended)
- Angular CLI (for building frontend)
- MySQL database (Azure Database for MySQL or compatible)
- (For Azure) Azure CLI and an Azure subscription

## Installation

1. Clone the repository:
   ```sh
   git clone <repository-url>
   cd my-node-app
   ```

2. Install backend dependencies:
   ```sh
   npm install
   ```

3. Install Angular frontend dependencies:
   ```sh
   cd my-angular-app
   npm install
   cd ..
   ```

## Building the Angular App

Before deploying or running locally, build the Angular app with the custom configuration:

```sh
cd my-angular-app
ng build --configuration=otherProduction
cd ..
```

This will output the static files to `dist/my-angular-app/browser`, which are served by Express.

## Running the Application Locally

1. Set up your `.env` file with your MySQL and app settings (see `.env.example` or below):
   ```env
   DB_HOST=your-mysql-host
   DB_USER=your-mysql-user
   DB_PASSWORD=your-mysql-password
   DB_DATABASE=sakila
   DB_PORT=3306
   DB_SSL_CA=./DigiCertGlobalRootCA.crt.pem
   PORT=3000
   ```

2. Start the backend server:
   ```sh
   npm start
   ```
   The application will be accessible at `http://localhost:3000`.

## Deploying to Azure App Service

1. Build the Angular app for production:
   ```sh
   cd my-angular-app
   ng build --configuration=otherProduction
   cd ..
   ```

2. Ensure your environment variables are set in Azure (App Service > Configuration), including:
   - DB_HOST
   - DB_USER
   - DB_PASSWORD
   - DB_DATABASE
   - DB_PORT
   - DB_SSL_CA (e.g., `../DigiCertGlobalRootCA.crt.pem`)
   - PORT (usually 80 or 3000)

3. Deploy to Azure (using Azure CLI):
   ```sh
   az webapp up --name <your-app-name> --resource-group <your-resource-group> --runtime "NODE|22-lts"
   ```
   Or use your preferred Azure deployment method (e.g., GitHub Actions, VS Code Azure extension).

4. After deployment, your app will be available at `https://<your-app-name>.azurewebsites.net`.

## Notes
- The backend serves the Angular app from `dist/my-angular-app/browser`.
- All API endpoints are prefixed with `/api`.
- MySQL SSL is required for Azure Database for MySQL. The DigiCertGlobalRootCA.crt.pem file must be present and referenced by `DB_SSL_CA`.
- For troubleshooting Azure deployment, see the comments in `web.config` and the project documentation.

## API Endpoints

### User Management
- `POST /api/signup` - Create new user account (also creates linked customer record)
- `POST /api/signin` - User authentication (returns user with customer data)
- `PUT /api/users/edit/:user_id` - Update user profile

### Film Management
- `GET /api/films` - List films with pagination, filtering, and inventory details
- `GET /api/films/:film_id` - Get film details by ID
- `POST /api/films` - Create new film
- `PUT /api/films/:film_id` - Update film details
- `DELETE /api/films/:film_id` - Delete film

### Inventory Management
- `GET /api/inventory/search` - Search inventory with grouping/filtering options
- `GET /api/inventory/available-in-store` - Check film availability in specific store
- `POST /api/inventory/create` - Create new inventory record(s) - supports quantity parameter for bulk creation
- `PUT /api/inventory/update/:inventory_id` - Update inventory record (only if not currently rented)

### Rental Management
- `POST /api/rentals/create` - Create rental(s) - supports batch creation with array of inventory_ids
- `PUT /api/rentals/return/:rental_id` - Return a rental
- `GET /api/rentals/active` - List active rentals for a customer
- `GET /api/rentals/history` - List rental history for a customer
- `GET /api/rentals/overdue` - List overdue rentals

### Customer Management
- `POST /api/customers` - Create new customer (typically done via signup)
- `PUT /api/customers/edit/:customer_id` - Update customer details
- `GET /api/customers/by-id/:customer_id` - Get customer by ID
- `GET /api/customers` - List customers with pagination

### Reference Data
- `GET /api/categories` - List all film categories
- `GET /api/languages` - List all languages
- `GET /api/stores/options` - List stores for dropdown options

### Request/Response Examples

#### Create Inventory Record
```http
POST /api/inventory/create
Content-Type: application/json

{
  "film_id": 1,
  "store_id": 1,
  "quantity": 5
}
```

#### Update Inventory Record
```http
PUT /api/inventory/update/123
Content-Type: application/json

{
  "film_id": 2,
  "store_id": 1
}
```

#### Batch Rental Creation
```http
POST /api/rentals/create
Content-Type: application/json

{
  "inventory_id": [101, 102, 103],
  "customer_id": 5,
  "staff_id": 1
}
```

## License

This project is licensed under the MIT License.

## Future Improvements

- Add a SQL schema file (e.g., `sakila-schema.sql`) to the repository for easy initialization of the MySQL database.
- Provide automated scripts for database migration and seeding.
- Add CI/CD pipeline examples for Azure deployment.
- Expand API documentation and add OpenAPI/Swagger support.
- Implement additional authentication and authorization features.
- Add unit and integration tests for backend and frontend.

**Note:**
If you are setting up the database for the first time, you will need the SQL schema file (such as `sakila-schema.sql`) to initialize your MySQL database. Import this file into your MySQL server before running the application.