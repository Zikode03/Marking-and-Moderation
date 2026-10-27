# Sales email delivery

Pricing is removed. Contact sales posts to `POST /api/sales/enquiries`. The backend validates the request, limits requests per IP, and sends plain-text email to `prosperacore.tech@gmail.com`. The visitor email is used as Reply-To; the sender and recipient come only from backend configuration. Success is returned only after SMTP accepts the email. Missing configuration or delivery failure returns 503; the form retains the enquiry for retry.

## Complete the sending configuration

In Visual Studio, right-click `ProsperaAssess.HttpApi.Host` and open **Manage User Secrets**. Merge a `SalesMail` section into the existing JSON; preserve the existing database and other settings:

```json
{
  "SalesMail": {
    "Host": "YOUR_SMTP_HOST",
    "Port": 587,
    "From": "YOUR_AUTHORISED_SENDER_EMAIL",
    "Username": "YOUR_SMTP_USERNAME",
    "Password": "YOUR_SMTP_PASSWORD_OR_APP_PASSWORD"
  }
}
```

The recipient is already configured in host appsettings. TLS is required. Gmail can use `smtp.gmail.com`, port 587, with the sending Gmail address as From and Username and an eligible account's app password as Password. Do not put email passwords in frontend environment variables, source control or chat. Google setup references: https://support.google.com/mail/answer/7104828 and https://support.google.com/accounts/answer/185833.

Stop debugging and restart the API after rebuilding so the new endpoint and settings are loaded. A running old API will not expose the new route. No live email has been sent during development verification; SMTP credentials are still required for a real delivery test.

For hosting, provide the same settings through server secrets or `SalesMail__Host`, `SalesMail__Port`, `SalesMail__From`, `SalesMail__Username`, and `SalesMail__Password`. Never expose them as `VITE_` variables.

Docker Compose forwards optional `SALES_SMTP_HOST`, `SALES_SMTP_PORT`, `SALES_SMTP_FROM`, `SALES_SMTP_USERNAME`, and `SALES_SMTP_PASSWORD` from the untracked Docker environment file. The Docker backend source mirror includes this endpoint.
