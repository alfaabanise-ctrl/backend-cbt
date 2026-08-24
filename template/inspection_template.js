
export const inspectionRequestTemplate = (
  sellerName,
  requesterName,
  requesterEmail,
  requesterPhone,
  propertyTitle,
  propertyLocation,
  inspectionDate,
  inspectionTime,
  message,
  propertyUrl
) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Property Inspection Request</title>
</head>

<body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fb;padding:30px 15px;">
<tr>
<td align="center">

<table width="650" cellpadding="0" cellspacing="0"
style="max-width:650px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.08);">

<!-- HEADER -->
<tr>
<td style="
background:linear-gradient(135deg,#a66804,#FFC059);
padding:35px;
text-align:center;
color:white;
">

<h1 style="margin:0;font-size:28px;">
🏡 Property Inspection Request
</h1>

<p style="margin:10px 0 0;font-size:15px;opacity:.9;">
A prospective client has requested an inspection.
</p>

</td>
</tr>

<!-- BODY -->
<tr>
<td style="padding:35px;">

<p style="
font-size:18px;
color:#111827;
margin-top:0;
">
Hello <strong>${sellerName}</strong>,
</p>

<p style="
color:#4b5563;
line-height:1.7;
font-size:15px;
">
A prospective buyer or tenant has requested to inspect one of your listed properties.
Please review the details below and contact the requester to confirm the appointment.
</p>

<!-- PROPERTY DETAILS -->
<div style="
background:#f8fafc;
border:1px solid #e5e7eb;
border-radius:12px;
padding:20px;
margin-top:25px;
">

<h3 style="
margin-top:0;
color:#111827;
">
📌 Property Details
</h3>

<p><strong>Property:</strong> ${propertyTitle}</p>

<p><strong>Location:</strong> ${propertyLocation}</p>

<p><strong>Inspection Date:</strong> ${inspectionDate}</p>

<p><strong>Inspection Time:</strong> ${inspectionTime}</p>

<p>
<strong>Status:</strong>
<span style="
background:#FFF4D6;
color:#B45309;
padding:6px 10px;
border-radius:20px;
font-size:12px;
font-weight:bold;
">
Pending Confirmation
</span>
</p>

</div>

<!-- REQUESTER -->
<div style="
background:#f8fafc;
border:1px solid #e5e7eb;
border-radius:12px;
padding:20px;
margin-top:20px;
">

<h3 style="
margin-top:0;
color:#111827;
">
👤 Requester Information
</h3>

<p><strong>Name:</strong> ${requesterName}</p>

<p><strong>Email:</strong> ${requesterEmail}</p>

<p><strong>Phone:</strong> ${requesterPhone}</p>

${
message
? `
<div style="
margin-top:15px;
padding:15px;
background:white;
border-left:4px solid #FFC059;
border-radius:6px;
">
<strong>Message</strong><br><br>
${message}
</div>
`
: ''
}

</div>

<!-- ACTIONS -->
<div style="
text-align:center;
margin-top:30px;
">

<a href="${propertyUrl}"
style="
display:inline-block;
padding:14px 28px;
background:#FFC059;
color:#111827;
text-decoration:none;
font-weight:700;
border-radius:8px;
margin-right:10px;
">
View Property
</a>

<a href="tel:${requesterPhone}"
style="
display:inline-block;
padding:14px 28px;
background:#111827;
color:#ffffff;
text-decoration:none;
font-weight:700;
border-radius:8px;
">
Call Requester
</a>

</div>

<!-- NOTICE -->
<div style="
margin-top:30px;
padding:18px;
background:#FEF3C7;
border-radius:10px;
">

<p style="
margin:0;
font-size:14px;
color:#92400E;
line-height:1.6;
">
Please contact the requester as soon as possible to confirm,
reschedule, or provide additional property information before the inspection.
</p>

</div>

</td>
</tr>

<!-- FOOTER -->
<tr>
<td style="
background:#fafafa;
padding:25px;
text-align:center;
border-top:1px solid #e5e7eb;
">

<p style="
margin:0;
font-size:13px;
color:#6b7280;
">
This notification was sent from Abanise Property Marketplace.
</p>

<p style="
margin-top:10px;
font-size:12px;
color:#9ca3af;
">
© ${new Date().getFullYear()} Abanise. All Rights Reserved.
</p>

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

