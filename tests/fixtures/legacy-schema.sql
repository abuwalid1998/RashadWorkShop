-- Schema of the legacy PHP/MySQL application, reconstructed from its queries.
-- Used only to test the migration; the app never needs MySQL.
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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;
