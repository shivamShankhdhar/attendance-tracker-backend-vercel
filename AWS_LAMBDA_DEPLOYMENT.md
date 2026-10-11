# AWS Lambda & Custom Domain Deployment Guide

This guide walks you through deploying the Bizora Attendance Tracker Backend to **AWS Lambda** with **API Gateway** and setting up your **Custom Domain** (with free SSL via AWS Certificate Manager).

---

## 1. Build the Deployable Lambda Package

Run the following command in this directory:

```bash
npm run package:lambda
```

This compiles TypeScript and bundles all production code and dependencies into a single, optimized zip archive:
- **Location**: `dist/lambda.zip` (~1.1 MB)
- **Handler**: `index.handler`

---

## 2. Create the AWS Lambda Function

1. Log into the [AWS Management Console](https://console.aws.amazon.com/lambda).
2. Choose your preferred AWS Region (e.g., `ap-south-1` Mumbai, `us-east-1` N. Virginia, etc.).
3. Click **Create function**:
   - **Choose**: **Author from scratch**
   - **Function name**: `bizora-attendance-backend`
   - **Runtime**: **Node.js 20.x**
   - **Architecture**: **arm64** (faster & 20% cheaper) or **x86_64**
   - **Execution role**: *Create a new role with basic Lambda permissions*
4. Click **Create function**.

### Upload Code
1. In the **Code source** tab, click **Upload from** -> **.zip file**.
2. Select [`dist/lambda.zip`](file:///Users/shivamshankhdhar/Projects/attendance-tracker-backend-vercel/dist/lambda.zip).
3. Click **Save**.

### Configure Runtime Settings
1. Scroll down to **Runtime settings** and click **Edit**:
   - **Handler**: Verify or set to `index.handler`
   - Click **Save**.

### Adjust Memory and Timeout
1. Go to the **Configuration** tab -> **General configuration** -> Click **Edit**:
   - **Memory**: `512 MB` or `1024 MB`
   - **Timeout**: `30 seconds` (to allow for database latency and cold starts)
   - Click **Save**.

---

## 3. Set Up Environment Variables in AWS Lambda

Go to the **Configuration** tab -> **Environment variables** -> Click **Edit** -> **Add environment variable**:

| Key | Value / Example | Description |
|---|---|---|
| `NODE_ENV` | `production` | Production mode |
| `PORT` | `5001` | Default port fallback |
| `MONGODB_URI` | `mongodb+srv://<user>:<password>@cluster.mongodb.net/attendance-tracker?retryWrites=true&w=majority` | Your MongoDB Atlas connection string |
| `JWT_ACCESS_SECRET` | *(At least 32 random characters)* | Access token signing secret |
| `JWT_REFRESH_SECRET` | *(At least 32 random characters)* | Refresh token signing secret |
| `JWT_ACCESS_EXPIRY` | `15m` | Access token lifespan |
| `JWT_REFRESH_EXPIRY` | `7d` | Refresh token lifespan |
| `QR_ENCRYPTION_KEY` | *(32+ hex character key)* | Key used for AES QR encryption |
| `GOOGLE_CLIENT_IDS` | `667573150359-4cff25jgf98hqq00pdrnojslk4bri5sb.apps.googleusercontent.com,...` | Allowed Google Client IDs |
| `APP_NAME` | `Bizora` | App name |
| `WORKPLACE_JOIN_URL` | `https://www.bizora.shivamshankhdhar.online/join` | Frontend join landing route |
| `GMAIL_USER` | `er.shivam.shankhdhar@gmail.com` | Email SMTP user for OTPs |
| `GMAIL_PASSWORD` | `dyfm mvmj rjum dakg` | Gmail App Password for SMTP |
| `RETRY_SECRET` | `dev_retry_secret` | Secret for cron tasks |

Click **Save**.

> [!IMPORTANT]
> **MongoDB Atlas Network Access**:
> AWS Lambda IP addresses are dynamic. In your **MongoDB Atlas Console** -> **Network Access**, ensure you have added IP Address `0.0.0.0/0` (Allow Access from Anywhere) with a strong database user password, or configure an AWS VPC with NAT Gateway.

---

## 4. Set Up API Gateway (HTTP API)

1. In the Lambda function console, click **+ Add trigger**.
2. Select **API Gateway**.
3. Under **Intent**, select **Create a new API**.
4. Choose **HTTP API** (Recommended: lowest latency, native payload format 2.0).
5. **Security**: Select **Open** (authorization is managed within your Express middleware and JWT tokens).
6. Click **Add**.

*API Gateway will create an endpoint like:* `https://<api-id>.execute-api.<region>.amazonaws.com`

---

## 5. Configure Your Custom Domain

To point your custom domain (e.g., `api.attendance-tracker.shivamshankhdhar.online` or `api.bizora.shivamshankhdhar.online`):

### Step A: Request a Free SSL Certificate in AWS ACM
1. Go to **AWS Certificate Manager (ACM)** in the **same region** as your API Gateway (e.g., `ap-south-1`).
2. Click **Request certificate** -> **Request a public certificate**.
3. **Fully qualified domain name**: enter your domain (e.g., `api.yourdomain.com` or `*.yourdomain.com`).
4. **Validation method**: **DNS validation** (Recommended).
5. Click **Request**.
6. Open the newly created certificate, copy the **CNAME name** and **CNAME value**, and add this CNAME record into your DNS provider (Cloudflare, GoDaddy, Namecheap, Hostinger, or Route 53) to validate domain ownership.
7. Once verified, the status will show **Issued** (usually 1–5 minutes).

### Step B: Create Custom Domain Name in API Gateway
1. Go to the [API Gateway Console](https://console.aws.amazon.com/apigateway).
2. In the left navigation, click **Custom domain names** -> **Create**.
3. **Domain name**: Enter your domain (e.g., `api.yourdomain.com`).
4. **Endpoint type**: **Regional**.
5. **ACM Certificate**: Select the certificate you created in Step A.
6. Click **Create domain name**.

### Step C: Configure API Mapping
1. On your custom domain details page, select the **API mappings** tab.
2. Click **Configure API mappings** -> **Add new mapping**:
   - **API**: Select your HTTP API (`bizora-attendance-backend-API`).
   - **Stage**: `$default`.
   - **Path**: Leave blank (maps to the root `/`).
3. Click **Save**.

### Step D: Update Your DNS Records
1. In the API Gateway Custom Domain details page, copy the **API Gateway domain name** (e.g., `d-xxxxxxxxxx.execute-api.<region>.amazonaws.com`).
2. Open your DNS provider (Cloudflare, GoDaddy, Route 53, etc.):
   - **Type**: `CNAME`
   - **Name / Host**: `api` (or whatever subdomain you chose)
   - **Target / Value**: `d-xxxxxxxxxx.execute-api.<region>.amazonaws.com`
   - **TTL**: Auto or 300 seconds
3. Click **Save**.

---

## 6. Verification

Once DNS propagates (usually 1–2 minutes), test your custom domain:

```bash
curl -i https://api.yourdomain.com/health
curl -i https://api.yourdomain.com/
```

Both should return `HTTP 200 OK` with `{"status":"healthy","name":"Bizora",...}`.
