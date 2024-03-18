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
        $searchQuery = "SELECT * FROM car_service_fixed WHERE vehicle_id LIKE '%$search_input%'";
    } elseif ($search_type === "customer_name") {
        $searchQuery = "SELECT * FROM car_service_fixed WHERE customer_name LIKE '%$search_input%'";
    }

    // Execute the query and handle errors
    $result = $conn->query($searchQuery);
    
    if (!$result) {
        $error_message = "Error executing the search query: " . $conn->error;
    } elseif ($result->num_rows > 0) {
        // Initialize an associative array to store summary data for each customer
        $customerSummary = array();

        while ($row = $result->fetch_assoc()) {
            $customer_name = $row["customer_name"];
            $vehicle_id = $row["vehicle_id"];
            $km_counter = $row["km_counter"];
            $date_of_change = $row["date_of_change"];
            $oil_type = $row["oil_type"];
            $total_price = $row["total_price"];
            $payment_amount = $row["payment_amount"];
            $remaining_amount = $row["remaining_amount"];
            $order_date = $row["order_date"];
            $oil_price = $row["oil_price"];

            // If the customer already exists in the summary array, update the aggregated data
            if (isset($customerSummary[$customer_name])) {
                $customerSummary[$customer_name]['total_services']++;
                $customerSummary[$customer_name]['total_price'] += $total_price;
                $customerSummary[$customer_name]['total_payment'] += $payment_amount;
                $customerSummary[$customer_name]['total_remaining'] += $remaining_amount;
                // Append service details to the existing array
                $customerSummary[$customer_name]['services'][] = array(
                    'service_name' => 'فلتر هواء',
                    'price' => $row['air_filter_price']
                );
                $customerSummary[$customer_name]['services'][] = array(
                    'service_name' => 'فلتر زيت',
                    'price' => $row['oil_filter_price']
                );
                $customerSummary[$customer_name]['services'][] = array(
                    'service_name' => 'فلتر ديزل',
                    'price' => $row['diesel_filter_price']
                );
                $customerSummary[$customer_name]['services'][] = array(
                    'service_name' => 'فلتر مكيف',
                    'price' => $row['ac_filter_price']
                );
                $customerSummary[$customer_name]['services'][] = array(
                    'service_name' => 'تغيير بوجيات',
                    'price' => $row['sparks_change_price']
                );
                $customerSummary[$customer_name]['services'][] = array(
                    'service_name' => 'حزام التايمنغ',
                    'price' => $row['timing_belt_price']
                );
            } else {
                // Otherwise, create a new entry for the customer
                $customerSummary[$customer_name] = array(
                    'vehicle_id' => $vehicle_id,
                    'total_services' => 1,
                    'total_price' => $total_price,
                    'total_payment' => $payment_amount,
                    'total_remaining' => $remaining_amount,
                    'services' => array(
                        array(
                            'service_name' => 'فلتر هواء',
                            'price' => $row['air_filter_price']
                        ),
                        array(
                            'service_name' => 'فلتر زيت',
                            'price' => $row['oil_filter_price']
                        ),
                        array(
                            'service_name' => 'فلتر ديزل',
                            'price' => $row['diesel_filter_price']
                        ),
                        array(
                            'service_name' => 'فلتر مكيف',
                            'price' => $row['ac_filter_price']
                        ),
                        array(
                            'service_name' => 'تغيير بوجيات',
                            'price' => $row['sparks_change_price']
                        ),
                        array(
                            'service_name' => 'حزام التايمنغ',
                            'price' => $row['timing_belt_price']
                        )
                    )
                );
            }
        }
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
    body {
        font-family: Arial, sans-serif;
        background-color: #f4f4f4;
        margin: 0;
        padding: 0;
    }

    .container {
        max-width: 800px;
        margin: 50px auto;
        padding: 20px;
        background-color: #fff;
        border-radius: 5px;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
    }

    h1 {
        text-align: center;
        margin-bottom: 20px;
    }

    form {
        text-align: center;
    }

    input[type="radio"],
    input[type="text"],
    input[type="submit"] {
        margin-top: 10px;
        margin-bottom: 10px;
    }

    .error {
        color: #ff0000;
        text-align: center;
    }

    .customer-summary {
        margin-top: 30px;
    }

    .customer-summary table {
        width: 100%;
        border-collapse: collapse;
    }

    .customer-summary th,
    .customer-summary td {
        border: 1px solid #ddd;
        padding: 8px;
        text-align: center;
    }

    .customer-summary th {
        background-color: #f2f2f2;
    }

    .customer-summary th:first-child,
    .customer-summary td:first-child {
        text-align: right;
    }

    .customer-summary ul {
        list-style-type: none;
        padding: 0;
        margin: 0;
    }

    .customer-summary li {
        margin-bottom: 5px;
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

    <?php if (!empty($customerSummary)): ?>
        <div class="customer-summary rtl">
            <h2>ملخص العملاء</h2>
            <table dir="rtl">
                <tr>
                    <th>اسم العميل</th>
                    <th>رقم المركبة</th>
                    <th>عدد الخدمات</th>
                    <th>السعر الإجمالي</th>
                    <th>مبلغ الدفع الإجمالي</th>
                    <th>المبلغ المتبقي الإجمالي</th>
                    <th>تفاصيل الخدمات</th>
                </tr>
                <?php foreach ($customerSummary as $customerName => $summary): ?>
                    <tr>
                        <td><?php echo $customerName; ?></td>
                        <td><?php echo $summary['vehicle_id']; ?></td>
                        <td><?php echo $summary['total_services']; ?></td>
                        <td><?php echo $summary['total_price']; ?></td>
                        <td><?php echo $summary['total_payment']; ?></td>
                        <td><?php echo $summary['total_remaining']; ?></td>
                        <td>
                            <ul>
                                <?php foreach ($summary['services'] as $service): ?>
                                    <li><?php echo $service['service_name']; ?> - <?php echo $service['price']; ?></li>
                                <?php endforeach; ?>
                            </ul>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </table>
        </div>
    <?php endif; ?>
</div>

</body>
</html>
