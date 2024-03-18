<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>بحث في سجلات الورشة (Workshop Service Records)</title>
  <link rel="stylesheet" href="styles.css">
  <style>
    body {
  font-family: Arial, sans-serif;
  margin: 0;
  padding: 20px;
}



label {
  display: block;
  margin-bottom: 5px;
}

table {
  border-collapse: collapse;
  width: 100%; /* Adjust width as needed */
  margin-bottom: 20px;
}

th, td {
  padding: 10px;
  border: 1px solid #ddd;
  text-align: right; /* Right-align for Arabic text */
}

th {
  background-color: #f1f1f1;
}

tbody tr:nth-child(even) {
  background-color: #f5f5f5;
}

  </style>
</head>
<body dir="rtl">


<?php
// Include the Database class
require_once('Database.php');

$servername = "localhost";
$port = "3306";
$username = "root";
$password = "";
$dbname = "carworkshop";

// Instantiate the Database class
$db = new Database($servername.":".$port, $username, $password, $dbname);
$conn = $db->getConnection();

// Check connection
if (!$conn) {
  die("خطأ في الاتصال بقاعدة البيانات: " . mysqli_connect_error());
}

// Search functionality (optional)
$searchTerm = "";
if (isset($_GET['search'])) {
  $searchTerm = filter_var($_GET['search'], FILTER_SANITIZE_STRING); // Basic search term sanitization
}

$sql = "SELECT * FROM car_service_fixed";

if ($searchTerm) {
  $sql .= " WHERE (customer_name LIKE '%$searchTerm%' OR vehicle_id LIKE '%$searchTerm%')";
}

$result = $conn->query($sql);

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


  <h1>بحث في سجلات الورشة (Workshop Service Records)</h1>

  <form action="index.php" method="GET">
    <label for="search">بحث (Search):</label>
    <input type="text" id="search" name="search" value="<?php echo $searchTerm; ?>">
    <button type="submit">بحث (Search)</button>
  </form>

  <h2>نتائج البحث (Search Results)</h2>
  <?php
  if ($result->num_rows > 0) {
    echo "<table>";
    echo "<thead>";
    echo "<tr>";
    echo "<th>رقم الطلب (Order ID)</th>";
    echo "<th>اسم العميل (Customer Name)</th>";
    echo "<th>معرف السيارة (Vehicle ID)</th>";
    echo "<th>تاريخ الطلب (Order Date)</th>";
    echo "<th>السعر الإجمالي (Total Price)</th>";
    echo "<th>مبلغ الدفع (Payment Amount)</th>";
    echo "</tr>";
    echo "</thead>";
    echo "<tbody>";

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

    echo "</tbody>";
    echo "</table>";
  } else {
    echo "<p>لا توجد نتائج للبحث (No Search Results)</p>";
  }

  // Close connection (assuming it's done in Database.php)
  ?>

</body>
</html>
