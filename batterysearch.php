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

$searchBy = "vehicle_id"; // Default search by vehicle ID
$searchText = "";

if ($_SERVER["REQUEST_METHOD"] == "GET") {
    if (isset($_GET["search_by"])) {
        $searchBy = $_GET["search_by"];
    }
    if (isset($_GET["search_text"])) {
        $searchText = $_GET["search_text"];
    }
}

$sql = "";
if ($searchBy == "vehicle_id") {
    $sql = "SELECT * FROM battery_warranty WHERE vehicle_id LIKE '%$searchText%'";
} else if ($searchBy == "customer_name") {
    $sql = "SELECT * FROM battery_warranty WHERE customer_name LIKE '%$searchText%'";
}

$result = $conn->query($sql);

?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Car Battery Warranty - Car Service</title>
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
            margin: 20px auto;
            padding: 20px;
            background-color: #fff;
            border-radius: 5px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }
        h1 {
            text-align: center;
            color: #333;
        }
        form {
            margin-bottom: 20px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        th, td {
            padding: 10px;
            text-align: center;
            border: 1px solid #ddd;
        }
        th {
            background-color: #f2f2f2;
            color: #333;
        }
        tr:nth-child(even) {
            background-color: #f9f9f9;
        }
        tr:hover {
            background-color: #e2e2e2;
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
    <h1>ضمان بطارية السيارة - نتيجة البحث</h1>

    <form action="batterysearch.php" method="GET">
        <label for="search_by">ابحث حسب:</label>
        <input type="radio" id="search_vehicle_id" name="search_by" value="vehicle_id" <?php if ($searchBy == "vehicle_id") echo "checked"; ?>>
        <label for="search_vehicle_id">رقم السيارة</label>
        <input type="radio" id="search_customer_name" name="search_by" value="customer_name" <?php if ($searchBy == "customer_name") echo "checked"; ?>>
        <label for="search_customer_name">اسم العميل</label>
        <br>

        <label for="search_text">ادخل كلمة البحث:</label>
        <input type="text" id="search_text" name="search_text" value="<?php echo $searchText; ?>" required>

        <input type="submit" value="بحث">
    </form>

    <?php
    if ($result->num_rows > 0) {
        echo "<table>
            <tr>
                <th>اسم العميل</th>
                <th>رقم السيارة</th>
                <th>نوع البطارية</th>
                <th>فترة الضمان</th>
                <th>تاريخ الشراء</th>
                <th>السعر</th>
                <th>مبلغ الدفع</th>
                <th>المتبقي</th>
                <th>تاريخ الطلب</th>
            </tr>";

        while ($row = $result->fetch_assoc()) {
            echo "<tr>
                <td>" . $row["customer_name"] . "</td>
                <td>" . $row["vehicle_id"] . "</td>
                <td>" . $row["battery_type"] . "</td>
                <td>" . $row["warranty_period"] . " months</td>
                <td>" . $row["purchase_date"] . "</td>
                <td>" . $row["price"] . "</td>
                <td>" . $row["payment_amount"] . "</td>
                <td>" . ($row["price"] - $row["payment_amount"]) . "</td>
                <td>" . $row["order_date"] . "</td>
            </tr>";
        }

        echo "</table>";
    } else {
        echo "No results found!";
    }

    $conn->close();
    ?>
</div>

</body>
</html>
