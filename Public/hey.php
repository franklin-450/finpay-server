<?php
session_start();
$pdo = new PDO('sqlite:' . __DIR__ . '/finpay.db');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

// CSRF token helper
if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
function check_csrf($token){ return hash_equals($_SESSION['csrf'] ?? '', $token ?? ''); }

function h($s){ return htmlspecialchars((string)$s, ENT_QUOTES, 'utf-8'); }
function currentUser($pdo){
    if(empty($_SESSION['user_id'])) return null;
    $stmt = $pdo->prepare("SELECT * FROM users WHERE id = ?");
    $stmt->execute([$_SESSION['user_id']]);
    return $stmt->fetch(PDO::FETCH_ASSOC);
}
$user = currentUser($pdo);

// Simple router based on ?page and POST actions
$page = $_GET['page'] ?? 'home';
$action = $_GET['action'] ?? ($_POST['action'] ?? null);

// POST actions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // LOGIN
    if ($action === 'login') {
        if (!check_csrf($_POST['csrf'] ?? '')) { die('Invalid CSRF'); }
        $email = $_POST['email'] ?? '';
        $pw = $_POST['password'] ?? '';
        $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
        $stmt->execute([$email]);
        $u = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($u && password_verify($pw, $u['password'])) {
            $_SESSION['user_id'] = $u['id'];
            header('Location: index.php?page=dashboard');
            exit;
        } else {
            $error = "Invalid credentials";
        }
    }

    // SIGNUP
    if ($action === 'signup') {
        if (!check_csrf($_POST['csrf'] ?? '')) { die('Invalid CSRF'); }
        $email = $_POST['email'] ?? '';
        $pw = $_POST['password'] ?? '';
        $fname = $_POST['first_name'] ?? '';
        if (empty($email) || empty($pw)) { $error = 'Provide email and password'; }
        else {
            $hash = password_hash($pw, PASSWORD_DEFAULT);
            $acc = 'FP' . (100000 + rand(1,99999));
            $stmt = $pdo->prepare("INSERT INTO users (email,password,first_name,account_no,balance) VALUES (?,?,?,?,?)");
            try {
                $stmt->execute([$email,$hash,$fname,$acc,0]);
                header('Location: index.php?page=login&created=1');
                exit;
            } catch(Exception $e) {
                $error = 'Could not create account (email may already exist)';
            }
        }
    }

    // LOGOUT
    if ($action === 'logout') {
        session_destroy();
        header('Location: index.php?page=login');
        exit;
    }

    // SEND PAYMENT
    if ($action === 'send' && $user) {
        if (!check_csrf($_POST['csrf'] ?? '')) { die('Invalid CSRF'); }
        $to = trim($_POST['to'] ?? '');
        $amount = (float)($_POST['amount'] ?? 0);
        $currency = $_POST['currency'] ?? 'USD';
        if ($amount <= 0) { $error = 'Invalid amount'; }
        else {
            // find recipient by email or phone
            $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ? OR phone = ? LIMIT 1");
            $stmt->execute([$to,$to]);
            $r = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($user['balance'] < $amount) { $error = 'Insufficient funds'; }
            else {
                // deduct sender
                $pdo->beginTransaction();
                if ($r) {
                    // to_user present
                    $pdo->prepare("UPDATE users SET balance = balance - ? WHERE id = ?")->execute([$amount,$user['id']]);
                    $pdo->prepare("UPDATE users SET balance = balance + ? WHERE id = ?")->execute([$amount,$r['id']]);
                    $txRef = 'TX-' . time() . '-' . rand(100,999);
                    $pdo->prepare("INSERT INTO txs (date,from_user,to_user,amount,type,status,ref) VALUES (?,?,?,?,?,?,?)")
                        ->execute([date('c'),$user['id'],$r['id'],$amount,'transfer','success',$txRef]);
                } else {
                    // external recipient (to_ref)
                    $pdo->prepare("UPDATE users SET balance = balance - ? WHERE id = ?")->execute([$amount,$user['id']]);
                    $txRef = 'TX-' . time() . '-' . rand(100,999);
                    $pdo->prepare("INSERT INTO txs (date,from_user,to_user,to_ref,amount,type,status,ref) VALUES (?,?,?,?,?,?,?,?)")
                        ->execute([date('c'),$user['id'],null,$to,$amount,'transfer','pending',$txRef]);
                }
                $pdo->commit();
                header('Location: index.php?page=transactions&sent=1');
                exit;
            }
        }
    }

    // TOPUP (Add money) - simulate external top up
    if ($action === 'topup' && $user) {
        if (!check_csrf($_POST['csrf'] ?? '')) { die('Invalid CSRF'); }
        $amount = (float)($_POST['amount'] ?? 0);
        if ($amount <= 0) { $error = 'Invalid amount'; }
        else {
            $ref = 'TP-' . time() . '-' . rand(10,99);
            $pdo->prepare("UPDATE users SET balance = balance + ? WHERE id = ?")->execute([$amount,$user['id']]);
            $pdo->prepare("INSERT INTO txs (date,from_user,to_user,amount,type,status,ref) VALUES (?,?,?,?,?,?,?)")
                ->execute([date('c'),null,$user['id'],$amount,'topup','success',$ref]);
            header('Location: index.php?page=dashboard&topup=1');
            exit;
        }
    }

    // SUPPORT TICKET
    if ($action === 'ticket' && $user) {
        if (!check_csrf($_POST['csrf'] ?? '')) { die('Invalid CSRF'); }
        $subject = trim($_POST['subject'] ?? '');
        $body = trim($_POST['body'] ?? '');
        if (empty($subject) || empty($body)) { $error = 'Provide subject and description'; }
        else {
            $stmt = $pdo->prepare("INSERT INTO tickets (user_id,subject,body) VALUES (?,?,?)");
            $stmt->execute([$user['id'],$subject,$body]);
            header('Location: index.php?page=support&ticket=1');
            exit;
        }
    }

} // end POST

// Render pages (simple PHP views)
function render_header($user) {
    $csrf = $_SESSION['csrf'];
    echo <<<HTML
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>FinPay PHP</title>
  <link rel="stylesheet" href="assets/style.css">
  <script defer src="assets/app.js"></script>
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <div class="brand"><div class="logo">FP</div><div><h3>FinPay</h3><div class="muted">Banking · Payments · Invest</div></div></div>
    <nav class="nav-section">
      <a class="nav-item" href="index.php?page=dashboard">Dashboard</a>
      <a class="nav-item" href="index.php?page=transactions">Transactions</a>
      <a class="nav-item" href="index.php?page=payments">Payments</a>
      <a class="nav-item" href="index.php?page=cards">Cards</a>
      <a class="nav-item" href="index.php?page=investments">Investments</a>
      <a class="nav-item" href="index.php?page=loans">Loans</a>
      <a class="nav-item" href="index.php?page=support">Support</a>
    </nav>
    <div class="nav-foot">© FinPay • v0.1</div>
  </aside>
  <main class="main">
    <div class="topbar">
      <div class="search"><input id="globalSearch" placeholder="Search..."></div>
      <div class="top-actions">
HTML;
    if ($user) {
        echo '<form method="post" style="display:inline"><input type="hidden" name="action" value="logout"><button class="icon-btn" title="Logout">Logout</button></form>';
    } else {
        echo '<a class="icon-btn" href="index.php?page=login">Login</a>';
    }
    echo '</div></div>';
}

function render_footer(){
    echo <<<HTML
  </main>
</div>
</body>
</html>
HTML;
}

// If not logged in and requesting protected pages -> redirect
$publicPages = ['home','login','signup'];
if (!$user && !in_array($page,$publicPages)) {
    header('Location: index.php?page=login');
    exit;
}

// Page: login
if ($page === 'login') {
    render_header(null);
    $created = isset($_GET['created']);
    global $error;
    echo '<div class="card col-12" style="max-width:540px;margin:40px;">';
    if (!empty($error)) echo '<div class="card" style="background:#ffecee;color:#900">'.h($error).'</div>';
    if ($created) echo '<div class="card" style="background:#e6ffef;color:#064">Account created. Please login.</div>';
    echo '<h2>Login</h2>';
    echo '<form method="post"><input type="hidden" name="action" value="login"><input type="hidden" name="csrf" value="'.h($_SESSION['csrf']).'">';
    echo '<div class="settings-row"><label>Email</label><input class="input" name="email" type="email"></div>';
    echo '<div class="settings-row"><label>Password</label><input class="input" name="password" type="password"></div>';
    echo '<div style="margin-top:10px"><button class="btn primary" type="submit">Login</button> <a href="index.php?page=signup" style="margin-left:12px">Sign up</a></div>';
    echo '</form></div>';
    render_footer();
    exit;
}

// Page: signup
if ($page === 'signup') {
    render_header(null);
    global $error;
    echo '<div class="card col-12" style="max-width:600px;margin:40px;">';
    if (!empty($error)) echo '<div class="card" style="background:#ffecee;color:#900">'.h($error).'</div>';
    echo '<h2>Create account</h2>';
    echo '<form method="post"><input type="hidden" name="action" value="signup"><input type="hidden" name="csrf" value="'.h($_SESSION['csrf']).'">';
    echo '<div class="settings-row"><label>First name</label><input class="input" name="first_name"></div>';
    echo '<div class="settings-row"><label>Email</label><input class="input" name="email" type="email"></div>';
    echo '<div class="settings-row"><label>Password</label><input class="input" name="password" type="password"></div>';
    echo '<div style="margin-top:10px"><button class="btn primary" type="submit">Create</button></div>';
    echo '</form></div>';
    render_footer();
    exit;
}

// Protected pages
render_header($user);

// Page: dashboard
if ($page === 'dashboard') {
    // refresh user
    $user = currentUser($pdo);
    echo "<div class=\"grid\">";
    echo "<div class=\"card col-4\"><div class=\"balance-large\"><div class=\"muted\" style=\"font-weight:700\">Total Balance</div><h1 id=\"mainBalance\">$".number_format($user['balance'],2)."</h1>";
    echo "<div class=\"balance-actions\"><form method=\"post\" style=\"display:inline\"><input type=\"hidden\" name=\"action\" value=\"topup\"><input type=\"hidden\" name=\"csrf\" value=\"".h($_SESSION['csrf'])."\"><input name=\"amount\" type=\"hidden\" value=\"100\"><button class=\"btn primary\" type=\"submit\">+ Add Money</button></form>";
    echo "<button class=\"btn ghost\" onclick=\"window.location='index.php?page=payments'\">Transfer</button></div></div></div>";

    // recent txs
    $stmt = $pdo->prepare("SELECT * FROM txs WHERE from_user = ? OR to_user = ? OR to_ref = ? ORDER BY id DESC LIMIT 6");
    $stmt->execute([$user['id'],$user['id'],$user['email']]);
    $txs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo "<div class=\"card col-8\"><div style=\"font-weight:700;margin-bottom:8px\">Recent Transactions</div><div style=\"max-height:220px;overflow:auto\"><table><thead><tr><th>Date</th><th>Ref</th><th>Amount</th><th>Status</th></tr></thead><tbody>";
    if (empty($txs)) echo "<tr><td colspan=\"4\" class=\"muted\">No transactions yet</td></tr>";
    foreach($txs as $t) {
        $amt = ($t['from_user'] == $user['id']) ? ('- $' . number_format($t['amount'],2)) : ('+ $' . number_format($t['amount'],2));
        echo "<tr><td>".h(substr($t['date'],0,10))."</td><td>".h($t['ref']?:$t['to_ref'])."</td><td>$amt</td><td>".h($t['status'])."</td></tr>";
    }
    echo "</tbody></table></div></div>";

    echo "<div class=\"card col-12\"><div style=\"font-weight:700\">Portfolio Snapshot</div><div style=\"margin-top:8px\">Total invested: <strong id=\"investTotal\">$3,200</strong></div></div>";
    echo "</div>";
    render_footer();
    exit;
}

// Page: transactions
if ($page === 'transactions') {
    $stmt = $pdo->prepare("SELECT * FROM txs WHERE from_user = ? OR to_user = ? OR to_ref = ? ORDER BY id DESC");
    $stmt->execute([$user['id'],$user['id'],$user['email']]);
    $txs = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo "<div class='card col-12'><h2>All Transactions</h2><table><thead><tr><th>Date</th><th>Ref</th><th>Type</th><th>Amount</th><th>Status</th></tr></thead><tbody>";
    if (empty($txs)) echo "<tr><td colspan='5' class='muted'>No transactions yet</td></tr>";
    foreach($txs as $t){
        echo "<tr><td>".h(substr($t['date'],0,10))."</td><td>".h($t['ref']?:$t['to_ref'])."</td><td>".h($t['type'])."</td><td>$".number_format($t['amount'],2)."</td><td>".h($t['status'])."</td></tr>";
    }
    echo "</tbody></table></div>";
    render_footer();
    exit;
}

// Page: payments
if ($page === 'payments') {
    global $error;
    echo "<div class='grid'><div class='card col-8'><h3>Send Payment</h3>";
    if (!empty($error)) echo "<div class='card' style='background:#ffecee;color:#900'>".h($error)."</div>";
    echo "<form method='post'><input type='hidden' name='action' value='send'><input type='hidden' name='csrf' value='".h($_SESSION['csrf'])."'>";
    echo "<div class='settings-row'><label>Recipient (phone or email)</label><input class='input' name='to'></div>";
    echo "<div style='display:flex;gap:12px'><input name='amount' class='input' placeholder='Amount' type='number' step='0.01'><select name='currency' class='input'><option>USD</option><option>KES</option></select></div>";
    echo "<div style='margin-top:12px'><button class='btn primary' type='submit'>Send</button></div></form></div>";
    echo "<div class='card col-4'><h4>Top up</h4><form method='post'><input type='hidden' name='action' value='topup'><input type='hidden' name='csrf' value='".h($_SESSION['csrf'])."'><input name='amount' class='input' value='100'><div style='margin-top:10px'><button class='btn primary' type='submit'>Top up</button></div></form></div></div>";
    render_footer();
    exit;
}

// Page: cards (static demo)
if ($page === 'cards') {
    echo "<div class='grid'><div class='card col-6'><h4>Virtual Card</h4><div class='muted'>**** **** **** 1234</div><div style='margin-top:12px'><button class='btn ghost' onclick=\"alert('Frozen')\">Freeze</button></div></div><div class='card col-6'><h4>Physical Card</h4><div class='muted'>**** **** **** 5678</div><div style='margin-top:12px'><button class='btn primary' onclick=\"alert('Replacement ordered')\">Order Replacement</button></div></div></div>";
    render_footer();
    exit;
}

// Page: investments
if ($page === 'investments') {
    echo "<div class='card col-12'><h3>Investments</h3><p>Portfolio performance (demo)</p></div>";
    render_footer();
    exit;
}

// Page: loans
if ($page === 'loans') {
    echo "<div class='card col-12'><h3>Loans</h3><ul><li>$500 at 5% (12 months) <button class='btn primary' onclick=\"alert('Applied')\">Apply</button></li></ul></div>";
    render_footer();
    exit;
}

// Page: support
if ($page === 'support') {
    global $error;
    echo "<div class='card col-12'><h3>Support</h3>";
    if (!empty($error)) echo "<div class='card' style='background:#ffecee;color:#900'>".h($error)."</div>";
    echo "<form method='post'><input type='hidden' name='action' value='ticket'><input type='hidden' name='csrf' value='".h($_SESSION['csrf'])."'>";
    echo "<div class='settings-row'><label>Subject</label><input class='input' name='subject'></div>";
    echo "<div class='settings-row'><label>Description</label><textarea class='input' name='body' style='min-height:120px'></textarea></div>";
    echo "<div style='margin-top:12px'><button class='btn primary' type='submit'>Submit Ticket</button></div></form></div>";
    render_footer();
    exit;
}

// Default: redirect to dashboard
header('Location: index.php?page=dashboard');
exit;
