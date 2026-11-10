<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Car Battery Warranty - Car Service</title>
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
    $customer_name = $_POST["customer_name"];
    $vehicle_id = $_POST["vehicle_id"];
    $battery_type = $_POST["battery_type"];
    $warranty_period = $_POST["warranty_period"];
    $purchase_date = $_POST["purchase_date"];
    $price = $_POST["price"];
    $payment_amount = $_POST["payment_amount"];
    $payment_date = $_POST["payment_date"];

    // Insert into battery_warranty table
    $batteryWarrantyInsertQuery = "INSERT INTO battery_warranty (
                                    customer_name, 
                                    phone_number, 
                                    vehicle_id, 
                                    battery_type, 
                                    warranty_period, 
                                    purchase_date, 
                                    price, 
                                    payment_amount, 
                                    remaining_amount, 
                                    order_date
                                  ) VALUES (
                                    '$customer_name', 
                                    '', 
                                    '$vehicle_id', 
                                    '$battery_type', 
                                    $warranty_period, 
                                    '$purchase_date', 
                                    $price, 
                                    $payment_amount, 
                                    $price - $payment_amount, 
                                    current_timestamp()
                                  )";

    $conn->query($batteryWarrantyInsertQuery);

    echo "Data inserted successfully!";
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
                <li><a href="batterysearch.php">بحث عن بطارية</a></li>
            </ul>
        </nav>
    </header>

<div class="container" dir="rtl">
  <h1>ضمان بطارية السيارة</h1>

  <form action="battery.php" method="POST">
    <label for="customer_name">اسم العميل:</label>
    <input type="text" id="customer_name" name="customer_name" required>

    <label for="vehicle_id">رقم السيارة:</label>
    <input type="text" id="vehicle_id" name="vehicle_id" required>

    <label for="battery_type">نوع البطارية:</label>
    <input type="text" id="battery_type" name="battery_type" required>

    <label for="warranty_period">فترة الضمان (بالشهور):</label>
    <input type="number" id="warranty_period" name="warranty_period" required>

    <label for="purchase_date">تاريخ الشراء:</label>
    <input type="date" id="purchase_date" name="purchase_date" required>

    <label for="price">السعر:</label>
    <input type="number" id="price" name="price" required>

    <label for="payment_amount">مبلغ الدفع:</label>
    <input type="number" id="payment_amount" name="payment_amount" required>

    <label for="payment_date">تاريخ الدفع:</label>
    <input type="date" id="payment_date" name="payment_date" required>

    <input type="submit" value="إرسال">
  </form>
</div>

</body>
</html>
