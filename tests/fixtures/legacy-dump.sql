/*M!999999\- enable the sandbox mode */ 

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `battery_warranty`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `battery_warranty` (
  `warranty_id` int(11) NOT NULL AUTO_INCREMENT,
  `customer_name` varchar(255) NOT NULL,
  `phone_number` varchar(20) DEFAULT NULL,
  `vehicle_id` varchar(50) NOT NULL,
  `battery_type` varchar(100) DEFAULT NULL,
  `warranty_period` int(11) DEFAULT NULL,
  `purchase_date` date DEFAULT NULL,
  `price` decimal(10,2) DEFAULT 0.00,
  `payment_amount` decimal(10,2) DEFAULT 0.00,
  `remaining_amount` decimal(10,2) DEFAULT 0.00,
  `order_date` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`warranty_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `battery_warranty` WRITE;
/*!40000 ALTER TABLE `battery_warranty` DISABLE KEYS */;
INSERT INTO `battery_warranty` VALUES
(1,'محمود أبو سالم','','88-222-11','Varta 70Ah',24,'2026-02-01',420.00,200.00,220.00,'2026-11-10 11:56:51');
/*!40000 ALTER TABLE `battery_warranty` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `car_service_fixed`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `car_service_fixed` (
  `order_id` int(11) NOT NULL AUTO_INCREMENT,
  `customer_name` varchar(255) NOT NULL,
  `phone_number` varchar(20) DEFAULT NULL,
  `vehicle_id` varchar(50) NOT NULL,
  `km_counter` int(11) DEFAULT NULL,
  `date_of_change` date DEFAULT NULL,
  `oil_type` varchar(100) DEFAULT NULL,
  `oil_price` decimal(10,2) DEFAULT 0.00,
  `total_price` decimal(10,2) DEFAULT 0.00,
  `payment_amount` decimal(10,2) DEFAULT 0.00,
  `remaining_amount` decimal(10,2) DEFAULT 0.00,
  `order_date` timestamp NOT NULL DEFAULT current_timestamp(),
  `air_filter_price` decimal(10,2) DEFAULT 0.00,
  `oil_filter_price` decimal(10,2) DEFAULT 0.00,
  `diesel_filter_price` decimal(10,2) DEFAULT 0.00,
  `ac_filter_price` decimal(10,2) DEFAULT 0.00,
  `sparks_change_price` decimal(10,2) DEFAULT 0.00,
  `timing_belt_price` decimal(10,2) DEFAULT 0.00,
  PRIMARY KEY (`order_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `car_service_fixed` WRITE;
/*!40000 ALTER TABLE `car_service_fixed` DISABLE KEYS */;
INSERT INTO `car_service_fixed` VALUES
(1,'أحمد خليل','','12-345-67',120000,NULL,'5W-30 كاسترول',150.00,225.00,150.00,25.00,'2026-11-10 11:56:51',30.00,45.00,0.00,0.00,0.00,0.00),
(2,'أحمد خليل','','12-345-67',128000,NULL,'5W-30',160.00,215.00,50.00,115.00,'2026-11-10 11:56:51',30.00,0.00,0.00,25.00,0.00,0.00),
(3,'محمود أبو سالم','','88-222-11',95000,NULL,'10W-40',120.00,835.00,835.00,0.00,'2026-11-10 11:56:51',25.00,0.00,60.00,0.00,180.00,450.00);
/*!40000 ALTER TABLE `car_service_fixed` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

