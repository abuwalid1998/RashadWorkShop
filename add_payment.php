<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title></title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>

<?php
// Include the Database class
include("Database.php");

// Replace these with your actual database details
$servername = "localhost";
$port = "3306";
$username = "root";
$password = "";
$dbname = "carworkshop";

// Instantiate the Database class
$db = new Database($servername . ":" . $port, $username, $password, $dbname);
$conn = $db->getConnection();

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    // Handle form submission
    $vehicle_id = $_POST["vehicle_id"];
    $payment_amount = $_POST["payment_amount"];
    $payment_date = $_POST["payment_date"];

    $updatePaymentQuery = "UPDATE car_service_fixed
                           SET payment_amount = payment_amount + $payment_amount,
                               remaining_amount = total_price - (payment_amount + $payment_amount)
                           WHERE vehicle_id = '$vehicle_id'";

    $conn->query($updatePaymentQuery);

    echo "Payment added successfully!";
}
?>

<header>
        <nav>
            <ul>
                <li><a href="index.php">الرئيسية</a></li>
                <li><a href="insert.php">إضافة طلب</a></li>
                <li><a href="search.php">بحث عن عميل</a></li>
                <li><a href="battery.php">ضمان بطارية السيارة</a></li>
                <li><a href="add_payment.php">إضافة الدفع</a></li>
                <li><a href="searchbar.php">مشاهدة البيانات</a></li>
            </ul>
        </nav>
    </header>

<div class="container" dir="rtl">
    <h1>تسديد دفعة</h1>

    <form action="add_payment.php" method="POST">
        <label for="vehicle_id">رقم المركبة</label>
        <input type="text" id="vehicle_id" name="vehicle_id" required>

        <label for="payment_amount">المبلغ المدفوع</label>
        <input type="number" id="payment_amount" name="payment_amount" required>

        <label for="payment_date">تاريخ الدفع</label>
        <input type="date" id="payment_date" name="payment_date" required>

        <input type="submit" value="Submit">
    </form>
</div>

</body>
</html>
