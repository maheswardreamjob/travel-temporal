package com.travel.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.*;

@Entity
@Table(name = "payment_records")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PaymentRecord {
    @Id
    private String paymentId;
    private String bookingId;
    private double amount;
    private String status; // PENDING, CHARGED, REFUNDED, FAILED
    private String transactionDate;
}
