<?php
// Include the Database class
include("Database.php");

// Replace these with your actual database details
$servername = "localhost"; // "localhost" is typically used for the server name
$port = "3306"; // Specify the port if it's different from the default MySQL port
$username = "root";
$password = "";
$dbname = "car_service_db";

// Instantiate the Database class
$db = new Database($servername . ":" . $port, $username, $password, $dbname);

// Get the database connection
try {
    $conn = $db->getConnection();
    echo "Connected successfully";
} catch (PDOException $e) {
    die("Connection failed: " . $e->getMessage());
}
?>
