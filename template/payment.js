
export const paymentEscrowNotificationTemplate = (
  sellerName,
  buyerName,
  amount,
  totalPaid,
  propertyTitle,
  propertyUrl
) => {
const formatNaira = (value) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((Number(value) || 0) / 100);
  return `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Payment Received</title>

<style>
body{
  margin:0;
  padding:0;
  background:#f4f6f8;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
}

@media only screen and (max-width:600px){

.container{
    width:100%!important;
}

.content{
    padding:16px!important;
}

.amount{
    font-size:30px!important;
}

.hero{
    font-size:22px!important;
}

}
</style>

</head>

<body>

<table
width="100%"
cellpadding="0"
cellspacing="0"
style="background:#f4f6f8;"
>

<tr>

<td
align="center"
style="padding:3px;"
>

<table
class="container"
width="600"
cellpadding="0"
cellspacing="0"
style="
width:600px;
max-width:600px;
background:#ffffff;
border-radius:12px;
overflow:hidden;
box-shadow:0 8px 20px rgba(0,0,0,.08);
"
>

<!-- HEADER -->

<tr>

<td
style="
padding:18px 20px;
background:linear-gradient(90deg,#2563eb,#4f46e5);
color:#fff;
"
>

<h2 style="margin:0;font-size:24px;">
Abanise Real Estate Marketplace
</h2>

</td>

</tr>

<!-- CONTENT -->

<tr>

<td class="content" style="padding:20px;">

<h2
class="hero"
style="
margin:0 0 10px;
font-size:26px;
color:#111827;
"
>

Hello ${sellerName},

</h2>

<p
style="
margin:0 0 18px;
font-size:16px;
line-height:1.7;
color:#475569;
"
>

A buyer has successfully made a payment towards one of your listed properties.

The payment has been securely received and is currently being held in
<strong>Abanise Escrow</strong> until the transaction is completed.

</p>

<!-- PAYMENT SUMMARY -->

<table
width="100%"
cellpadding="0"
cellspacing="0"
style="
background:#f8fafc;
border:1px solid #dbeafe;
border-radius:10px;
margin-bottom:18px;
"
>

<tr>

<td style="padding:16px;">

<div
style="
font-size:13px;
font-weight:700;
color:#0284c7;
margin-bottom:10px;
"
>

PAYMENT RECEIVED

</div>

<div
class="amount"
style="
font-size:38px;
font-weight:800;
color:#16a34a;
margin-bottom:16px;
"
>

${formatNaira(amount)}

</div>

<p style="margin:8px 0;color:#334155;">
<strong>Buyer:</strong> ${buyerName}
</p>

<p style="margin:8px 0;color:#334155;">
<strong>Property:</strong> ${propertyTitle}
</p>

<p style="margin:8px 0;color:#334155;">
<strong>Total Paid So Far:</strong>
₦${formatNaira(totalPaid)}
</p>

</td>

</tr>

</table>

<!-- NOTICE -->

<div
style="
background:#fff7ed;
border-left:4px solid #f59e0b;
padding:14px;
border-radius:8px;
margin-bottom:20px;
"
>

<p
style="
margin:0;
font-size:15px;
line-height:1.7;
color:#92400e;
"
>

<strong>Important</strong><br><br>

This payment has been placed in escrow for the protection of both the buyer and seller.

The funds are
<strong>not yet available for withdrawal.</strong>

They will only be released after the property transaction has been successfully completed in accordance with Abanise's escrow policy.

</p>

</div>

<p
style="
margin:0 0 18px;
line-height:1.7;
color:#475569;
"
>

You can monitor this transaction at any time to:

</p>

<ul
style="
margin:0 0 24px;
padding-left:20px;
line-height:1.8;
color:#475569;
"
>

<li>View the buyer's payment progress.</li>

<li>Track the total amount already paid.</li>

<li>See the outstanding balance.</li>

<li>Monitor the escrow status.</li>

</ul>

<table
width="100%"
cellpadding="0"
cellspacing="0"
>

<tr>

<td align="center">

<a
href="${propertyUrl}"
style="
display:inline-block;
background:#2563eb;
color:#fff;
text-decoration:none;
padding:14px 28px;
border-radius:8px;
font-weight:600;
"
>

View Payment Progress

</a>

</td>

</tr>

</table>

<p
style="
margin:26px 0 0;
font-size:14px;
line-height:1.7;
color:#64748b;
word-break:break-word;
"
>

If the button above doesn't work, copy and paste the following link into your browser:

<br><br>

<a
href="${propertyUrl}"
style="
color:#2563eb;
text-decoration:none;
"
>

${propertyUrl}

</a>

</p>

<hr
style="
border:none;
border-top:1px solid #e5e7eb;
margin:24px 0;
"
/>

<p
style="
margin:0;
font-size:13px;
line-height:1.7;
color:#94a3b8;
"
>

Thank you for choosing
<strong>Abanise Real Estate Marketplace.</strong>

Our escrow system is designed to ensure every property transaction is secure, transparent, and safe for both buyers and sellers.

</p>

</td>

</tr>

<!-- FOOTER -->

<tr>

<td
style="
padding:14px 20px;
background:#f8fafc;
font-size:12px;
color:#94a3b8;
text-align:center;
"
>

© ${new Date().getFullYear()} Abanise Real Estate Marketplace.
All rights reserved.

</td>

</tr>

</table>

</td>

</tr>

</table>

</body>
</html>
`;
};
