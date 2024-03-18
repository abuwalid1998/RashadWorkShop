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

$error_message = ""; // Initialize error message variable

if ($_SERVER["REQUEST_METHOD"] == "POST" && isset($_POST["search_input"])) {

    $search_input = $_POST["search_input"];
    $search_type = $_POST["search_type"];

    // Construct the query based on the selected search type
    if ($search_type === "vehicle_id") {
        $searchQuery = "SELECT * FROM car_service_fixed WHERE vehicle_id = '$search_input'";
    } elseif ($search_type === "customer_name") {
        $searchQuery = "SELECT * FROM car_service_fixed WHERE customer_name LIKE '%$search_input%'";
    }

    // Execute the query and handle errors
    $result = $conn->query($searchQuery);
    
    if (!$result) {
        $error_message = "Error executing the search query: " . $conn->error;
    } elseif ($result->num_rows > 0) {
        // Fetch data if results are found
        $row = $result->fetch_assoc();
        $customer_name = $row["customer_name"];
        $phone_number = $row["phone_number"];
        $vehicle_id = $row["vehicle_id"];
        $km_counter = $row["km_counter"];
        $date_of_change = $row["date_of_change"];
        $oil_type = $row["oil_type"];
        $total_price = $row["total_price"];
        $payment_amount = $row["payment_amount"];
        $remaining_amount = $row["remaining_amount"];
        $order_date = $row["order_date"];
        $oil_price = $row["oil_price"];
        // Fetch individual service details
        $serviceDetails = [
            ["name" => "فلتر هواء", "price" => $row["air_filter_price"]],
            ["name" => "فلتر زيت", "price" => $row["oil_filter_price"]],
            ["name" => "فلتر ديزل", "price" => $row["diesel_filter_price"]],
            ["name" => "فلتر مكيف", "price" => $row["ac_filter_price"]],
            ["name" => "تغيير بوجيات", "price" => $row["sparks_change_price"]],
            ["name" => "حزام التايمنغ", "price" => $row["timing_belt_price"]]
        ];
    } else {
        $error_message = "No records found for the provided search query.";
    }
}
?>

<!DOCTYPE html>
<html lang="ar">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Search Customer - Car Service</title>
    <link rel="stylesheet" href="styles.css">
    <style>
.service-details table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 20px;
}

.service-details th,
.service-details td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: left;
}

.service-details th {
    background-color: #f2f2f2;
}

.service-details table th {
    text-align: center; /* Aligns table headers to the right */
}

.service-details table td {
    text-align: center; /* Aligns table data to the left (default) */
}

/* New styles for search form */
.container {
    text-align: center;
    margin-top: 50px;
}

form {
    margin-bottom: 20px;
}

label {
    font-weight: bold;
}

input[type="radio"],
input[type="text"],
input[type="submit"] {
    margin-top: 10px;
    margin-bottom: 10px;
}

/* RTL styles */
.rtl {
    direction: rtl;
}

/* Clearfix */
.clearfix::after {
    content: "";
    clear: both;
    display: table;
}
    </style>
</head>
<body>

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
    <h1>بحث عن زبون</h1>

    <form action="search.php" method="POST">
    <label for="search_type">بحث عن طريق</label><br>
    <input type="radio" id="search_vehicle_id" name="search_type" value="vehicle_id" checked>
    <label for="search_vehicle_id">رقم المركبة</label><br>
    <input type="radio" id="search_customer_name" name="search_type" value="customer_name">
    <label for="search_customer_name">أسم العميل</label><br>
    <input type="text" id="search_input" name="search_input" required>
    <input type="submit" value="Search">
</form>

    <?php if (isset($error_message)): ?>
        <p class="error"><?php echo $error_message; ?></p>
    <?php endif; ?>

    <?php if (isset($customer_name)): ?>
        <div class="service-details rtl">
    <h2>معلومات العميل</h2>
    <table dir="rtl">
      <tr>
        <th>اسم العميل:</th>
        <td><?php echo $customer_name; ?></td>
      </tr>
      <tr>
        <th>رقم الهاتف:</th>
        <td><?php echo $phone_number; ?></td>
      </tr>
      <tr>
        <th>معرف السيارة:</th>
        <td><?php echo $vehicle_id; ?></td>
      </tr>
      <tr>
        <th>عداد الكيلومترات:</th>
        <td><?php echo $km_counter; ?></td>
      </tr>
      <tr>
        <th>تاريخ التغيير:</th>
        <td><?php echo $date_of_change; ?></td>
      </tr>
      <tr>
        <th>نوع الزيت:</th>
        <td><?php echo $oil_type; ?></td>
      </tr>
      <tr>
        <th>السعر الإجمالي:</th>
        <td><?php echo $total_price; ?></td>
      </tr>
      <tr>
        <th>مبلغ الدفع:</th>
        <td><?php echo $payment_amount; ?></td>
      </tr>
      <tr>
        <th>المبلغ المتبقي:</th>
        <td><?php echo $remaining_amount; ?></td>
      </tr>
      <tr>
        <th>تاريخ الطلب:</th>
        <td><?php echo $order_date; ?></td>
      </tr>
    </table>
  </div>

        <div class="service-details rtl">
            <h2>تفاصيل الزيارة</h2>
            <table dir="rtl">
                <tr>
                    <th>اسم الخدمة</th>
                    <th>السعر</th>
                </tr>
                <?php foreach ($serviceDetails as $service): ?>
                    <tr>
                        <td><?php echo $service["name"]; ?></td>
                        <td><?php echo $service["price"]; ?></td>
                    </tr>
                <?php endforeach; ?>
                <tr>
                    <td>سعر الزيت</td>
                    <td><?php echo $oil_price; ?></td>


                </tr>
            </table>
        </div>
    <?php endif; ?>
</div>

</body>
</html>
