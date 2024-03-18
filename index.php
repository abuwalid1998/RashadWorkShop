<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Car Workshop Report (الورشة تقرير)</title>
    <link rel="stylesheet" href="styles.css">
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
        }

        header {
            background-color: #333;
            color: #fff;
            padding: 10px 0;
        }

        nav ul {
            list-style-type: none;
            margin: 0;
            padding: 0;
            text-align: center;
        }

        nav ul li {
            display: inline;
            margin-right: 20px;
        }

        nav ul li a {
            color: #fff;
            text-decoration: none;
        }

        h1,
        h2 {
            text-align: center;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }

        th,
        td {
            padding: 8px;
            text-align: center;
            border-bottom: 1px solid #ddd;
        }

        th {
            background-color: #333;
            color: #fff;
        }

        tbody tr:nth-child(even) {
            background-color: #f2f2f2;
        }
    </style>
</head>

<body dir="rtl">
<?php
include ("Database.php");

$servername = "localhost";
$port = "3306";
$username = "root";
$password = "";
$dbname = "carworkshop";

// Instantiate the Database class
$db = new Database($servername.":".$port, $username, $password, $dbname);
$conn = $db->getConnection();

// Check connection
if ($conn->connect_error) {

    die ("Connection failed: " . $conn->connect_error);

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

    <h1>تقرير ورشة تصليح السيارات</h1>

    <h2>عدد السيارات</h2>
    <ul>
        <li>هذا الشهر:
            <?php echo getVehicleCountByMonth(date('m')); ?>
        </li>
        <li>اليوم:
            <?php echo getVehicleCountByDay(date('d')); ?>
        </li>
    </ul>

    <h2>إجمالي المدفوعات</h2>
    <p>إجمالي المبلغ المدفوع:
        <?php echo getTotalPayments(); ?> شيقل
    </p>
    <p>إجمالي المبالغ المتبقية:
        <?php echo getTotalRem(); ?> شيقل
    </p>

    <h2>الخدمات الأخيرة</h2>
    <table>
        <thead>
            <tr>
                <th>رقم الطلب</th>
                <th>اسم العميل</th>
                <th>معرف السيارة</th>
                <th>تاريخ الطلب</th>
                <th>السعر الإجمالي</th>
                <th>مبلغ الدفع</th>
            </tr>
        </thead>
        <tbody>
            <?php
            function getVehicleCountByMonth($month)
            {
                global $conn;
                $sql = "SELECT COUNT(*) AS vehicle_count FROM car_service_fixed WHERE MONTH(order_date) = $month AND YEAR(order_date) = YEAR(CURDATE())";
                $result = $conn->query($sql);
                $row = $result->fetch_assoc();
                if ($row[] = null) {
                    return 0;
                }
                return $row['vehicle_count'];
            }

            function getTotalPayments()
            {
                global $conn;
                $sql = "SELECT SUM(payment_amount) AS total_payments FROM car_service_fixed";
                $result = $conn->query($sql);
                $row = $result->fetch_assoc();
                if ($row[] = null) {
                    return 0;
                }
                return $row['total_payments'];
            }

            function getTotalRem()
            {
                global $conn;
                $sql = "SELECT SUM(remaining_amount) AS rem_payments FROM car_service_fixed";
                $result = $conn->query($sql);
                $row = $result->fetch_assoc();
                if ($row[] = null) {
                    return 0;
                }
                return $row['rem_payments'];
            }

            // Get 10 recent services
            $sql = "SELECT * FROM car_service_fixed ORDER BY order_date DESC LIMIT 10";
            $result = $conn->query($sql);
            if ($result->num_rows > 0) {
                while ($row = $result->fetch_assoc()) {
                    echo "<tr>";
                    echo "<td>" . $row['order_id'] . "</td>";
                    echo "<td>" . $row['customer_name'] . "</td>";
                    echo "<td>" . $row['vehicle_id'] . "</td>";
                    echo "<td>" . $row['order_date'] . "</td>";
                    echo "<td>" . $row['total_price'] . " شيقل</td>";
                    echo "<td>" . $row['payment_amount'] . " شيقل</td>";
                    echo "</tr>";
                }
            } else {
                echo "0 results";
            }


            function getVehicleCountByDay($day) {
                global $conn;
                $sql = "SELECT COUNT(*) AS vehicle_count FROM car_service_fixed WHERE DAY(order_date) = $day AND YEAR(order_date) = YEAR(CURDATE())";
                $result = $conn->query($sql);
                $row = $result->fetch_assoc();
                return $row['vehicle_count'];
              }

            // Close connection
            $conn->close();
            ?>
        </tbody>

    </table>
</body>

</html>