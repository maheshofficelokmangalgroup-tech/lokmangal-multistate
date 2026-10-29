<?php
// Receives the website's enquiry forms and emails them to the society.
// Works on any standard PHP host (PHP 7.4+). Update the addresses below if needed.
declare(strict_types=1);

$TO_GENERAL = 'emailus@lokmangal.co.in';
$TO_CAREERS = 'hr@lokmangal.in';
$FROM       = 'no-reply@lokmangalmultistate.com';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function respond(int $code, array $body): void
{
    http_response_code($code);
    echo json_encode($body);
    exit;
}

function cut(string $s, int $max): string
{
    return function_exists('mb_substr') ? mb_substr($s, 0, $max) : substr($s, 0, $max);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respond(405, ['ok' => false, 'error' => 'Method not allowed']);
}

// Only accept submissions from this website.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$host   = $_SERVER['HTTP_HOST'] ?? '';
if ($origin !== '' && parse_url($origin, PHP_URL_HOST) !== preg_replace('/:\d+$/', '', $host)) {
    respond(403, ['ok' => false, 'error' => 'Forbidden']);
}

// Spam traps: hidden "website" field and submissions faster than 3 seconds are silently dropped.
if (!empty($_POST['website'])) {
    respond(200, ['ok' => true]);
}
$ts = (int) ($_POST['ts'] ?? 0);
if ($ts > 0 && (microtime(true) * 1000 - $ts) < 3000) {
    respond(200, ['ok' => true]);
}

// Simple rate limit: 8 submissions per IP per hour.
$ip     = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$bucket = sys_get_temp_dir() . '/lm_enquiry_' . md5($ip);
$now    = time();
$hits   = [];
if (is_file($bucket)) {
    $saved = json_decode((string) file_get_contents($bucket), true);
    $hits  = array_values(array_filter(is_array($saved) ? $saved : [], fn ($t) => $t > $now - 3600));
}
if (count($hits) >= 8) {
    respond(429, ['ok' => false, 'error' => 'Too many requests. Please call us instead.']);
}
$hits[] = $now;
@file_put_contents($bucket, json_encode($hits));

$forms = [
    'account'  => 'New account opening request',
    'deposit'  => 'New deposit application',
    'loan'     => 'New loan application',
    'contact'  => 'New contact message',
    'callback' => 'Callback request',
    'service'  => 'Service enquiry',
    'career'   => 'New job application',
];
$form = array_key_exists($_POST['form'] ?? '', $forms) ? $_POST['form'] : 'contact';

$labels = [
    'first_name'   => 'First name',
    'middle_name'  => 'Middle name',
    'last_name'    => 'Last name',
    'name'         => 'Name',
    'phone'        => 'Phone',
    'email'        => 'Email',
    'city'         => 'City / location',
    'account_type' => 'Account type',
    'deposit_type' => 'Deposit scheme',
    'loan_type'    => 'Loan type',
    'amount'       => 'Loan amount (Rs.)',
    'interest'     => 'Interested in',
    'position'     => 'Position',
    'experience'   => 'Experience (years)',
    'message'      => 'Message',
    'page'         => 'Submitted from page',
];

$email = filter_var(trim((string) ($_POST['email'] ?? '')), FILTER_VALIDATE_EMAIL);
$phone = preg_replace('/[^0-9+]/', '', (string) ($_POST['phone'] ?? ''));
if (!$email || strlen($phone) < 10) {
    respond(422, ['ok' => false, 'error' => 'Please enter a valid email address and phone number.']);
}

$lines = [];
foreach ($labels as $key => $label) {
    $raw = trim(strip_tags((string) ($_POST[$key] ?? '')));
    if ($raw === '') {
        continue;
    }
    $value   = $key === 'message' ? cut($raw, 3000) : cut(preg_replace('/\s+/', ' ', $raw), 200);
    $lines[] = str_pad($label . ':', 22) . $value;
}

$subject = '[Website] ' . $forms[$form];
$body    = $forms[$form] . " — lokmangalmultistate.com\n"
         . str_repeat('-', 48) . "\n"
         . implode("\n", $lines) . "\n"
         . str_repeat('-', 48) . "\n"
         . 'Received: ' . date('d M Y, h:i A') . "\n"
         . 'IP address: ' . $ip . "\n";

$headers = [
    'From'         => "Lokmangal Website <{$FROM}>",
    'Reply-To'     => $email,
    'Content-Type' => 'text/plain; charset=UTF-8',
    'X-Mailer'     => 'PHP/' . PHP_VERSION,
];

$to   = $form === 'career' ? $TO_CAREERS : $TO_GENERAL;
$sent = @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, $headers);

if (!$sent) {
    respond(500, ['ok' => false, 'error' => 'Your message could not be sent. Please call us.']);
}
respond(200, ['ok' => true]);
