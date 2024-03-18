<!DOCTYPE html>
<html lang="ar">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Insert Order - Car Service</title>
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

// Handle form submission
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    // Extract form data
    $customer_name = $_POST["customer_name"];
    $vehicle_id = $_POST["vehicle_id"];
    $km_counter = $_POST["km_counter"];
    $date_of_change = $_POST["date_of_change"];
    $oil_type = $_POST["oil_type"];
    $oil_price = isset($_POST["oil_price"]) ? floatval($_POST["oil_price"]) : 0;
    $services = isset($_POST["services"]) ? $_POST["services"] : [];
    $service_prices = isset($_POST["service_prices"]) ? $_POST["service_prices"] : [];
    $payment_amount = $_POST["payment_amount"];
    $payment_date = $_POST["payment_date"];

    // Calculate total price based on selected services and their prices
    $total_price = $oil_price + array_sum($service_prices);
    
    // Insert into car_service_fixed table
    $carServiceInsertQuery = "INSERT INTO car_service_fixed (
        customer_name, 
        phone_number, 
        vehicle_id, 
        km_counter, 
        oil_type, 
        oil_price,
        total_price, 
        payment_amount, 
        remaining_amount, 
        order_date, 
        air_filter_price, 
        oil_filter_price, 
        diesel_filter_price, 
        ac_filter_price, 
        sparks_change_price, 
        timing_belt_price
    ) VALUES (
        '$customer_name', 
        '', 
        '$vehicle_id', 
        $km_counter, 
        '$oil_type', 
        $oil_price,
        $total_price, 
        $payment_amount, 
        $total_price - $payment_amount, 
        current_timestamp(), 
        {$service_prices[0]}, 
        {$service_prices[1]}, 
        {$service_prices[2]}, 
        {$service_prices[3]}, 
        {$service_prices[4]}, 
        {$service_prices[5]}
    )";

    $conn->query($carServiceInsertQuery);

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
            </ul>
        </nav>
    </header>

<div class="container" dir="rtl">
    <h1>أضافة طلبية جديدة</h1>

    <form action="insert.php" method="POST">
        <label for="customer_name">اسم الزبون</label>
        <input type="text" id="customer_name" name="customer_name" required>

        <label for="vehicle_id">رقم السيارة</label>
        <input type="text" id="vehicle_id" name="vehicle_id" required>

        <label for="km_counter">عداد السيارة</label>
        <input type="number" id="km_counter" name="km_counter" required>


        <label for="oil_type">نوع الزيت</label>
        <input type="text" id="oil_type" name="oil_type" required>

        <label for="oil_price">سعر الزيت</label>
        <input type="number" id="oil_price" name="oil_price" onchange="updateTotalPrice()" required>

        <div id="services-container">
            <!-- Fixed list of services -->
            <?php
            $fixedServices = [
                'فلتر زيت' => 0,
                'فلتر هواء' => 0,
                'فلتر ديزل' => 0,
                'فلتر مكيف' => 0,
                'تغير بوجيات' => 0,
                'تغير حزام تايمنج' => 0,
            ];

            foreach ($fixedServices as $serviceName => $servicePrice):
            ?>
    <div class="service-option">
        <label><?= $serviceName ?></label>
        <input type="hidden" name="services[]" value="<?= $serviceName ?>">
        <input type="number" placeholder="Service Price" name="service_prices[]" value="<?= $servicePrice ?>" onchange="updateTotalPrice()">
    </div>
            <?php endforeach; ?>
        </div>

        <label for="payment_amount">المبلغ المدفوع</label>
        <input type="number" id="payment_amount" name="payment_amount" required>

        <label for="payment_date">تاريخ الدفعة</label>
        <input type="date" id="payment_date" name="payment_date" required>

        <label for="total_price">السعر الكلي</label>
        <input type="number" id="total_price" name="total_price" readonly>

        <input type="submit" value="أدخال">
    </form>

    <script>
        function updateTotalPrice() {
            // Calculate total price based on individual service prices and oil price
            var total_service = 0;
            var total = 0;

            // Get oil price as a numeric value
            var oil_price = parseFloat(document.getElementById("oil_price").value) || 0;

            // Get individual service prices
            var servicePrices = document.getElementsByName("service_prices[]");

            // Calculate total service price
            for (var i = 0; i < servicePrices.length; i++) {
                total_service += parseFloat(servicePrices[i].value) || 0;
            }

            // Calculate total price including oil price
            total = total_service + oil_price;

            // Update the total price input field
            document.getElementById("total_price").value = total;
        }
    </script>
</div>

</body>
</html>
