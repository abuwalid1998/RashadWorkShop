<!DOCTYPE html>
<html lang="ar">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Insert Order - Car Service</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 0;
            background-color: #f8f9fa;
            direction: rtl;
        }

        header {
            background-color: #343a40;
            color: #ffffff;
            padding: 15px 0;
            text-align: center;
        }

        .container {
            max-width: 1000px;
            margin: 50px auto;
            background-color: #ffffff;
            padding: 20px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
            border-radius: 8px;
        }

        .grid-container {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            grid-gap: 20px;
        }

        .form-group {
            margin-bottom: 20px;
        }

        .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: bold;
            color: #333;
            text-align: end;
        }

        .form-group input,
        .form-group select {
            width: 100%;
            padding: 10px;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-sizing: border-box;
            font-size: 16px;
        }

        .form-group input[type="submit"] {
            background-color: #007bff;
            color: #fff;
            padding: 12px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 18px;
        }
    </style>
</head>
<body>

<header>
    <h2>أضافة طلبية جديدة</h2>
</header>

<div class="container" dir="rtl">
    <h1>أضافة طلبية جديدة</h1>

    <form action="insert.php" method="POST">
        <div class="grid-container">
            <div class="form-group">
                <label for="customer_name">اسم الزبون</label>
                <input type="text" id="customer_name" name="customer_name" required>
            </div>
            <div class="form-group">
                <label for="vehicle_id">رقم السيارة</label>
                <input type="text" id="vehicle_id" name="vehicle_id" required>
            </div>
            <div class="form-group">
                <label for="km_counter">عداد السيارة</label>
                <input type="number" id="km_counter" name="km_counter" required>
            </div>
            <div class="form-group">
                <label for="oil_type">نوع الزيت</label>
                <input type="text" id="oil_type" name="oil_type" required>
            </div>
            <div class="form-group">
                <label for="oil_price">سعر الزيت</label>
                <input type="number" id="oil_price" name="oil_price" onchange="updateTotalPrice()" required>
            </div>
            <div class="form-group">
                <label>فلاتر الخدمة</label>
                <!-- Fixed list of services -->
                <?php
                $fixedServices = [
                    'فلتر زيت',
                    'فلتر هواء',
                    'فلتر ديزل',
                    'فلتر مكيف',
                    'تغير بوجيات',
                    'تغير حزام تايمنج',
                ];

                foreach ($fixedServices as $serviceName):
                ?>
                <div class="service-option">
                    <label><?= $serviceName ?></label>
                    <input type="number" placeholder="سعر الخدمة" name="service_prices[]" onchange="updateTotalPrice()">
                </div>
                <?php endforeach; ?>
            </div>
            <div class="form-group">
                <label for="payment_amount">المبلغ المدفوع</label>
                <input type="number" id="payment_amount" name="payment_amount" required>
            </div>
            <div class="form-group">
                <label for="payment_date">تاريخ الدفعة</label>
                <input type="date" id="payment_date" name="payment_date" required>
            </div>
            <div class="form-group">
                <label for="total_price">السعر الكلي</label>
                <input type="number" id="total_price" name="total_price" readonly>
            </div>
        </div>

        <input type="submit" value="أدخال">
    </form>

    <script>
        function updateTotalPrice() {
            var total_service = 0;
            var total = 0;
            var oil_price = parseFloat(document.getElementById("oil_price").value) || 0;
            var servicePrices = document.getElementsByName("service_prices[]");

            for (var i = 0; i < servicePrices.length; i++) {
                total_service += parseFloat(servicePrices[i].value) || 0;
            }

            total = total_service + oil_price;
            document.getElementById("total_price").value = total;
        }
    </script>
</div>


</body>
</html>
